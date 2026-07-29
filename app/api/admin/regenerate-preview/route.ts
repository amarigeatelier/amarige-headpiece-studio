import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { generateSingleSoloPreview } from "@/lib/actions/parts";

const DATA_URL_PATTERN = /^data:(image\/[a-z+]+);base64,(.+)$/;

function parseDataUrl(dataUrl: unknown): { bytes: Uint8Array; contentType: string } | null {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(DATA_URL_PATTERN);
  if (!match) return null;
  return { bytes: new Uint8Array(Buffer.from(match[2], "base64")), contentType: match[1] };
}

// Auth is already enforced by middleware.ts's matcher on /api/admin/:path*.
export async function POST(req: NextRequest) {
  const { partId, basePhotoId, layoutImageBase64 } = await req.json();

  if (typeof partId !== "string" || typeof basePhotoId !== "string") {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const layout = parseDataUrl(layoutImageBase64);
  if (!layout) {
    return NextResponse.json({ error: "配置下書き画像が不正です" }, { status: 400 });
  }

  await generateSingleSoloPreview(partId, basePhotoId, layout);
  revalidatePath(`/admin/parts/${partId}`);

  return NextResponse.json({ ok: true });
}
