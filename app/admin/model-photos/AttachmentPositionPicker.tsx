"use client";

import { useRef, useState } from "react";

const CLAMP_MIN = 3;
const CLAMP_MAX = 97;

// ドラッグで「パーツの初期位置」を指定するための単純な点ピッカー。
// PartSizer と違い大きさは扱わない（位置だけ）。
export default function AttachmentPositionPicker({
  imageUrl,
  initialXPercent,
  initialYPercent,
}: {
  imageUrl: string;
  initialXPercent: number;
  initialYPercent: number;
}) {
  const [xPercent, setXPercent] = useState(initialXPercent);
  const [yPercent, setYPercent] = useState(initialYPercent);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function updateFromPointer(e: React.PointerEvent) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setXPercent(Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, ((e.clientX - rect.left) / rect.width) * 100)));
    setYPercent(Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, ((e.clientY - rect.top) / rect.height) * 100)));
  }

  return (
    <div>
      <label className="mb-1 block text-sm text-neutral-600">
        パーツの初期位置（サイズ調整画面を開いたときの開始位置。実際の髪の位置に近づけておくと、消えずに生成されやすくなります）
      </label>
      <div
        ref={containerRef}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as Element).setPointerCapture(e.pointerId);
          setDragging(true);
          updateFromPointer(e);
        }}
        onPointerMove={(e) => dragging && updateFromPointer(e)}
        onPointerUp={(e) => {
          (e.target as Element).releasePointerCapture(e.pointerId);
          setDragging(false);
        }}
        onPointerCancel={() => setDragging(false)}
        className="relative aspect-[3/4] w-full max-w-xs touch-none select-none overflow-hidden rounded-lg bg-neutral-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="pointer-events-none h-full w-full object-cover" draggable={false} />
        <div
          className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-pink-500 shadow active:cursor-grabbing"
          style={{ left: `${xPercent}%`, top: `${yPercent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        丸をドラッグして、実際に髪飾りを着ける場所（お団子の上・編み込みの上など）に合わせてください。
      </p>
      <input type="hidden" name="defaultAttachmentXPercent" value={xPercent} />
      <input type="hidden" name="defaultAttachmentYPercent" value={yPercent} />
    </div>
  );
}
