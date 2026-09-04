"use client";

import { useState } from "react";

// Vercel's serverless functions hard-reject request bodies over ~4.4MB (confirmed directly via
// binary search against production: 4.2MB got through, 4.4MB got a 413) — this is a platform-level
// limit that next.config.ts's bodySizeLimit/proxyClientMaxBodySize settings cannot raise. Real
// transparent-PNG cutout photos routinely exceed this (one measured at 5.16MB), so uploads that
// worked fine locally were silently failing in production. Resize+re-encode client-side before
// the form ever submits, rather than asking saki to manually shrink every photo herself.
//
// The cap has to leave room for MULTIPLE files in the same submission — the part form has up to
// three (cutout, sizeReference, compositingImage). A fixed single resize target isn't reliable on
// its own: output size depends on the image's own detail/texture, not just pixel count, so the same
// cap that got one photo comfortably under budget left a more texture-heavy one still too big —
// confirmed directly against production, where two real files that individually looked fine still
// failed combined. Iterate down through smaller candidates and re-measure each time, rather than
// trusting one guessed setting.
//
// PNG (the original approach) is lossless, so the only way to shrink it is fewer pixels — that made
// real cutout photos come out visibly soft/blurry once resized small enough to fit (saki noticed and
// flagged this directly). WebP still supports transparency but compresses photographic detail far
// more efficiently: the same real cutout photo that needed ~1000px/PNG (~1.1MB, visibly softened) to
// fit the budget encodes at ~0.5MB at its FULL original resolution as WebP quality 0.85 — no
// downscaling needed at all for a typical photo. The resize/quality ladder below is a fallback only
// still-large or unusually detailed photos will actually walk through.
const CANDIDATES: { edge: number; quality: number }[] = [
  { edge: Infinity, quality: 0.85 },
  { edge: 1600, quality: 0.8 },
  { edge: 1200, quality: 0.7 },
  { edge: 900, quality: 0.6 },
  { edge: 700, quality: 0.5 },
];
const SAFE_UPLOAD_BYTES = 0.9 * 1024 * 1024;

async function encodeCandidate(bitmap: ImageBitmap, edge: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // canvasは初期状態で透明なので、背景塗りつぶしをしなければ透過部分はそのまま保たれる。
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

function withWebpExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return (dot === -1 ? fileName : fileName.slice(0, dot)) + ".webp";
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= SAFE_UPLOAD_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  let best: Blob | null = null;
  for (const { edge, quality } of CANDIDATES) {
    const blob = await encodeCandidate(bitmap, edge, quality);
    if (!blob) continue;
    best = blob;
    if (blob.size <= SAFE_UPLOAD_BYTES) break; // 目標サイズに収まった時点でそれ以上は縮小・劣化させない
  }
  if (!best || best.size >= file.size) return file;
  return new File([best], withWebpExtension(file.name), { type: "image/webp" });
}

export default function CompressibleFileInput({
  name,
  required,
  className,
}: {
  name: string;
  required?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file || file.size <= SAFE_UPLOAD_BYTES) {
      setStatus(null);
      return;
    }
    const beforeMb = (file.size / 1024 / 1024).toFixed(1);
    setStatus(`写真を軽量化しています…（元: ${beforeMb}MB）`);
    try {
      const compressed = await compressImage(file);
      const dt = new DataTransfer();
      dt.items.add(compressed);
      input.files = dt.files;
      if (compressed.size < file.size) {
        setStatus(`写真を軽量化しました（${beforeMb}MB → ${(compressed.size / 1024 / 1024).toFixed(1)}MB）`);
      } else {
        setStatus(`このサイズ（${beforeMb}MB）だとアップロードに失敗する可能性があります。可能なら小さい写真に差し替えてください。`);
      }
    } catch {
      setStatus("写真の軽量化に失敗しました。元のサイズのままアップロードされます。");
    }
  }

  return (
    <div>
      <input type="file" name={name} accept="image/*" required={required} className={className} onChange={handleChange} />
      {status && <p className="mt-1 text-xs text-blue-600">{status}</p>}
    </div>
  );
}
