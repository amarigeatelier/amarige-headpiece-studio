import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchImageBytes, uploadImage, compositeImagePath } from "@/lib/storage";
import { composeParts } from "@/lib/gemini";
import { MULTI_COMPOSITE_PROMPT_VERSION } from "@/lib/prompt-templates";
import { computeCombinationKey, sortPartIds } from "@/lib/composite-key";
import { getClientIp, hashIp, isUnderDailyLimit, recordGenerationAttempt, DAILY_GENERATION_LIMIT } from "@/lib/rate-limit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const { basePhotoId, partIds, email } = await req.json();

  if (typeof basePhotoId !== "string" || !Array.isArray(partIds) || partIds.length === 0) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (!partIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "有効なメールアドレスを入力してください" }, { status: 400 });
  }

  const ip = getClientIp(req);
  await db.previewLead.create({ data: { email, ipHash: hashIp(ip) } });

  const basePhoto = await db.modelBasePhoto.findUnique({ where: { id: basePhotoId } });
  if (!basePhoto || !basePhoto.active) {
    return NextResponse.json({ error: "選択されたモデル写真は利用できません" }, { status: 404 });
  }

  const parts = await db.part.findMany({ where: { id: { in: partIds }, status: "active" } });
  if (parts.length !== partIds.length) {
    return NextResponse.json({ error: "選択されたパーツの一部が利用できません" }, { status: 404 });
  }

  const sortedPartIds = sortPartIds(partIds);
  const combinationKey = computeCombinationKey(basePhotoId, sortedPartIds);

  const cached = await db.generatedComposite.findUnique({ where: { combinationKey } });
  if (cached && cached.status === "ready" && cached.promptVersion === MULTI_COMPOSITE_PROMPT_VERSION && cached.imageUrl) {
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
    const [partImages, base] = await Promise.all([
      Promise.all(
        parts.map(async (part) => {
          const [{ bytes, contentType }, sizeReference] = await Promise.all([
            fetchImageBytes(part.cutoutImageUrl),
            part.sizeReferenceImageUrl ? fetchImageBytes(part.sizeReferenceImageUrl) : Promise.resolve(null),
          ]);
          return {
            partId: part.id,
            label: part.name,
            sizeNote: part.sizeNote,
            cutoutBytes: bytes,
            cutoutMimeType: contentType,
            sizeReferenceBytes: sizeReference?.bytes,
            sizeReferenceMimeType: sizeReference?.contentType,
          };
        })
      ),
      fetchImageBytes(basePhoto.imageUrl),
    ]);

    await recordGenerationAttempt(ip);

    const result = await composeParts({
      parts: partImages,
      baseBytes: base.bytes,
      baseMimeType: base.contentType,
      attachmentZone: basePhoto.attachmentZone,
    });

    const imageUrl = await uploadImage(compositeImagePath(combinationKey), result.imageBytes, result.mimeType);

    const composite = await db.generatedComposite.upsert({
      where: { combinationKey },
      create: {
        basePhotoId,
        combinationKey,
        partIds: sortedPartIds,
        imageUrl,
        status: "ready",
        promptVersion: result.promptVersion,
      },
      update: {
        imageUrl,
        status: "ready",
        promptVersion: result.promptVersion,
        errorMessage: null,
        lastServedAt: new Date(),
      },
    });

    return NextResponse.json({ compositeId: composite.id, imageUrl, cached: false });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.generatedComposite.upsert({
      where: { combinationKey },
      create: { basePhotoId, combinationKey, partIds: sortedPartIds, status: "failed", promptVersion: MULTI_COMPOSITE_PROMPT_VERSION, errorMessage },
      update: { status: "failed", errorMessage },
    });
    return NextResponse.json({ error: "プレビューの生成に失敗しました。もう一度お試しください。" }, { status: 502 });
  }
}
