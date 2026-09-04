import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchImageBytes, uploadImage, compositeImagePath } from "@/lib/storage";
import { mechanicalCompositeMultiple, type MechanicalPlacement } from "@/lib/deterministic-composite";
import { computeCombinationKey, sortPartIds, type PartLayout } from "@/lib/composite-key";
import { MIN_WIDTH_PERCENT, MAX_WIDTH_PERCENT, AUTO_SIZE_SAFETY_MARGIN, VISUAL_SIZE_BOOST } from "@/lib/sizing-constants";
import { getClientIp, hashIp, isUnderDailyLimit, recordGenerationAttempt, DAILY_GENERATION_LIMIT } from "@/lib/rate-limit";

// A customer selecting many parts composites them one at a time (mechanicalCompositeMultiple),
// which can add up past the platform's default function duration limit — same issue confirmed on
// the admin part-registration routes.
export const maxDuration = 60;

// Version tag for the composite pipeline that actually produced an image — bumped whenever the
// pipeline's output would differ for the same inputs, so a cached row from the old Gemini-generated
// pipeline is never served as if it were a (deterministic, differently-composed) mechanical result.
// Bumped to v2 alongside MECHANICAL_COMPOSITE_VERSION — see its comment. A cached composite from
// v1 was generated with the old tone-matching darkening bug and must not be served as current.
export const MECHANICAL_MULTI_COMPOSITE_VERSION = "mechanical-multi-v2";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Used only when neither the part nor the base photo has a real-world cm measurement registered yet
// — keeps generation working (imprecise size) rather than blocking it, matching the previous client
// fallback fraction.
const FALLBACK_WIDTH_PERCENT = 18;

type IncomingInstance = { instanceId: string; partId: string };

function parseInstances(raw: unknown): IncomingInstance[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const instances: IncomingInstance[] = [];
  for (const item of raw) {
    if (!item || typeof item.instanceId !== "string" || typeof item.partId !== "string") return null;
    instances.push({ instanceId: item.instanceId, partId: item.partId });
  }
  return instances;
}

function parseLayout(raw: unknown): PartLayout[] | null {
  if (!Array.isArray(raw)) return null;
  const layout: PartLayout[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item.instanceId === "string" &&
      typeof item.partId === "string" &&
      Number.isFinite(item.xPercent) &&
      Number.isFinite(item.yPercent) &&
      Number.isFinite(item.rotationDeg)
    ) {
      layout.push({
        instanceId: item.instanceId,
        partId: item.partId,
        xPercent: item.xPercent,
        yPercent: item.yPercent,
        rotationDeg: item.rotationDeg,
      });
    }
  }
  return layout;
}

export async function POST(req: NextRequest) {
  const { basePhotoId, instances: rawInstances, email, layout: rawLayout } = await req.json();

  if (typeof basePhotoId !== "string" || typeof email !== "string" || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const instances = parseInstances(rawInstances);
  const layout = parseLayout(rawLayout);
  if (!instances || !layout || layout.length !== instances.length) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const ip = getClientIp(req);
  await db.previewLead.create({ data: { email, ipHash: hashIp(ip) } });

  const basePhoto = await db.modelBasePhoto.findUnique({ where: { id: basePhotoId } });
  if (!basePhoto || !basePhoto.active) {
    return NextResponse.json({ error: "選択されたモデル写真は利用できません" }, { status: 404 });
  }

  const partIds = instances.map((i) => i.partId);
  const uniquePartIds = Array.from(new Set(partIds));
  const parts = await db.part.findMany({ where: { id: { in: uniquePartIds }, status: "active" } });
  if (parts.length !== uniquePartIds.length) {
    return NextResponse.json({ error: "選択されたパーツの一部が利用できません" }, { status: 404 });
  }
  const partsById = new Map(parts.map((p) => [p.id, p]));

  const layoutByInstanceId = new Map(layout.map((l) => [l.instanceId, l]));
  if (!instances.every((i) => layoutByInstanceId.has(i.instanceId))) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const sortedPartIds = sortPartIds(partIds);
  const combinationKey = computeCombinationKey(basePhotoId, partIds, layout);

  const cached = await db.generatedComposite.findUnique({ where: { combinationKey } });
  if (cached && cached.status === "ready" && cached.promptVersion === MECHANICAL_MULTI_COMPOSITE_VERSION && cached.imageUrl) {
    await db.generatedComposite.update({ where: { id: cached.id }, data: { lastServedAt: new Date() } });
    return NextResponse.json({ compositeId: cached.id, imageUrl: cached.imageUrl, cached: true });
  }

  if (!(await isUnderDailyLimit(ip))) {
    return NextResponse.json(
      {
        error: `本日の生成回数の上限（${DAILY_GENERATION_LIMIT}回）に達しました。追加生成をご希望の場合は購入してご利用いただけます。`,
        limitReached: true,
      },
      { status: 429 }
    );
  }

  try {
    const uniqueCutoutBytes = new Map(
      await Promise.all(
        parts.map(async (part) => {
          const { bytes } = await fetchImageBytes(part.compositingImageUrl || part.cutoutImageUrl);
          return [part.id, bytes] as const;
        })
      )
    );

    const base = await fetchImageBytes(basePhoto.imageUrl);
    await recordGenerationAttempt(ip);

    const placements: MechanicalPlacement[] = instances.map((instance) => {
      const part = partsById.get(instance.partId)!;
      const l = layoutByInstanceId.get(instance.instanceId)!;
      const widthPercent =
        part.realWidthCm != null && basePhoto.realWidthCm != null
          ? Math.min(
              MAX_WIDTH_PERCENT,
              Math.max(
                MIN_WIDTH_PERCENT,
                (part.realWidthCm / basePhoto.realWidthCm) * 100 * AUTO_SIZE_SAFETY_MARGIN * VISUAL_SIZE_BOOST
              )
            )
          : FALLBACK_WIDTH_PERCENT;
      return {
        cutoutBytes: uniqueCutoutBytes.get(instance.partId)!,
        targetWidthPercent: widthPercent,
        centerXPercent: l.xPercent,
        centerYPercent: l.yPercent,
        rotationDeg: l.rotationDeg,
      };
    });

    const imageBytes = await mechanicalCompositeMultiple(base.bytes, placements);
    const imageUrl = await uploadImage(compositeImagePath(combinationKey), imageBytes, "image/png");

    const composite = await db.generatedComposite.upsert({
      where: { combinationKey },
      create: {
        basePhotoId,
        combinationKey,
        partIds: sortedPartIds,
        imageUrl,
        status: "ready",
        promptVersion: MECHANICAL_MULTI_COMPOSITE_VERSION,
      },
      update: {
        imageUrl,
        status: "ready",
        promptVersion: MECHANICAL_MULTI_COMPOSITE_VERSION,
        errorMessage: null,
        lastServedAt: new Date(),
      },
    });

    return NextResponse.json({ compositeId: composite.id, imageUrl, cached: false });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.generatedComposite.upsert({
      where: { combinationKey },
      create: {
        basePhotoId,
        combinationKey,
        partIds: sortedPartIds,
        status: "failed",
        promptVersion: MECHANICAL_MULTI_COMPOSITE_VERSION,
        errorMessage,
      },
      update: { status: "failed", errorMessage },
    });
    return NextResponse.json({ error: "プレビューの生成に失敗しました。もう一度お試しください。" }, { status: 502 });
  }
}
