"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`画像の読み込みに失敗しました: ${src}`));
    img.src = src;
  });
}

const CLAMP_MIN = 3;
const CLAMP_MAX = 97;
const MIN_WIDTH_PERCENT = 5;
const MAX_WIDTH_PERCENT = 60;
const DEFAULT_WIDTH_PERCENT = 20;

export default function PartSizer({
  partId,
  basePhotoId,
  baseImageUrl,
  cutoutImageUrl,
  partName,
  initialXPercent,
  initialYPercent,
  initialWidthPercent,
}: {
  partId: string;
  basePhotoId: string;
  baseImageUrl: string;
  cutoutImageUrl: string;
  partName: string;
  initialXPercent?: number | null;
  initialYPercent?: number | null;
  initialWidthPercent?: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [xPercent, setXPercent] = useState(initialXPercent ?? 50);
  const [yPercent, setYPercent] = useState(initialYPercent ?? 45);
  // widthPercent is the true unit sent to the server: % of the base photo's width.
  // The UI never shows this number directly — it shows a "% of what's currently displayed"
  // figure instead (baselineWidthPercent = 100%), since that's the size saki can actually judge by eye.
  const baselineWidthPercent = initialWidthPercent ?? DEFAULT_WIDTH_PERCENT;
  const [widthPercent, setWidthPercent] = useState(baselineWidthPercent);
  const [dragMode, setDragMode] = useState<"move" | "resize" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const relativeWidthPercent = Math.round((widthPercent / baselineWidthPercent) * 100);
  const relativeMin = Math.ceil((MIN_WIDTH_PERCENT / baselineWidthPercent) * 100);
  const relativeMax = Math.floor((MAX_WIDTH_PERCENT / baselineWidthPercent) * 100);

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragMode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (dragMode === "move") {
      setXPercent(Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, ((e.clientX - rect.left) / rect.width) * 100)));
      setYPercent(Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, ((e.clientY - rect.top) / rect.height) * 100)));
    } else {
      const centerX = rect.left + (xPercent / 100) * rect.width;
      const distPx = Math.max(1, (e.clientX - centerX) * 2);
      const percent = (distPx / rect.width) * 100;
      setWidthPercent(Math.min(MAX_WIDTH_PERCENT, Math.max(MIN_WIDTH_PERCENT, percent)));
    }
  }

  function handleRelativeWidthInput(relativeValue: number) {
    if (Number.isNaN(relativeValue)) return;
    const absolute = baselineWidthPercent * (relativeValue / 100);
    setWidthPercent(Math.min(MAX_WIDTH_PERCENT, Math.max(MIN_WIDTH_PERCENT, absolute)));
  }

  function startDrag(e: React.PointerEvent, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragMode(mode);
  }

  function endDrag(e: React.PointerEvent) {
    if (dragMode) (e.target as Element).releasePointerCapture(e.pointerId);
    setDragMode(null);
  }

  async function handleRegenerate() {
    setBusy(true);
    setError(null);
    try {
      const baseImg = await loadImage(baseImageUrl);
      const canvas = document.createElement("canvas");
      canvas.width = baseImg.naturalWidth;
      canvas.height = baseImg.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unsupported");
      ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

      const cutoutImg = await loadImage(cutoutImageUrl);
      const w = canvas.width * (widthPercent / 100);
      const h = w * (cutoutImg.naturalHeight / cutoutImg.naturalWidth);
      const cx = (xPercent / 100) * canvas.width;
      const cy = (yPercent / 100) * canvas.height;
      ctx.drawImage(cutoutImg, cx - w / 2, cy - h / 2, w, h);

      const layoutImageBase64 = canvas.toDataURL("image/png");

      const res = await fetch("/api/admin/regenerate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partId, basePhotoId, layoutImageBase64, xPercent, yPercent, widthPercent }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "再生成に失敗しました");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "再生成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded border border-neutral-300 px-2 py-1 text-xs">
        サイズを調整して再生成
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-neutral-300 bg-white p-3">
      <p className="mb-2 text-xs text-neutral-600">
        {partName}をドラッグで移動、大きさは右下のつまみをドラッグするか、下の数値欄で調整してから「この配置で再生成」を押してください。
        {initialWidthPercent != null
          ? "下の「大きさ」は今表示されている画像を100%とした割合です。50にすると今の半分の大きさになります。"
          : "この組み合わせはまだサイズ調整で生成したことがないため、100%は目安のスタート地点です（一度生成すれば、次回からは今の画像を基準に調整できます）。"}
      </p>
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative aspect-[3/4] w-full max-w-xs touch-none select-none overflow-hidden rounded-lg bg-neutral-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={baseImageUrl} alt="" className="pointer-events-none h-full w-full object-cover" draggable={false} />
        <div
          style={{
            position: "absolute",
            left: `${xPercent}%`,
            top: `${yPercent}%`,
            width: `${widthPercent}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cutoutImageUrl}
            alt={partName}
            draggable={false}
            onPointerDown={(e) => startDrag(e, "move")}
            className="w-full cursor-grab touch-none object-contain drop-shadow-md active:cursor-grabbing"
          />
          <div
            onPointerDown={(e) => startDrag(e, "resize")}
            className="absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-neutral-900 shadow"
            title="ドラッグで大きさを調整"
          />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs">
        <label htmlFor={`width-percent-${partId}-${basePhotoId}`} className="text-neutral-600">
          大きさ（今の画像を100%として）
        </label>
        <input
          id={`width-percent-${partId}-${basePhotoId}`}
          type="number"
          min={relativeMin}
          max={relativeMax}
          step={1}
          value={relativeWidthPercent}
          onChange={(e) => handleRelativeWidthInput(e.target.valueAsNumber)}
          className="w-16 rounded border border-neutral-300 px-2 py-1"
        />
        <span className="text-neutral-400">%</span>
        <input
          type="range"
          min={relativeMin}
          max={relativeMax}
          step={1}
          value={relativeWidthPercent}
          onChange={(e) => handleRelativeWidthInput(e.target.valueAsNumber)}
          className="flex-1"
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={busy}
          className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy ? "生成中..." : "この配置で再生成"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded border border-neutral-300 px-3 py-1.5 text-xs">
          キャンセル
        </button>
      </div>
    </div>
  );
}
