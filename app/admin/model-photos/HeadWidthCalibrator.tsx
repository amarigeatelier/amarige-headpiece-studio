"use client";

import { useRef, useState } from "react";

const CLAMP_MIN = 1;
const CLAMP_MAX = 99;

// 成人女性の頭の横幅（耳から耳まで）の一般的な仮定値。ドラッグ操作の補助的な目安としてのみ使う
// （実際に使われる値は下の数値欄で、ドラッグ後も直接編集できる）。
const ASSUMED_HEAD_WIDTH_CM = 18;

// 写真の中で頭の左端・右端をドラッグすると「頭は約18cm」という仮定から写真全体の実寸を計算し、
// 数値欄に反映する。ただし数値欄はいつでも直接上書きでき、実際に保存されるのはその数値。
export default function HeadWidthCalibrator({
  imageUrl,
  initialRealWidthCm,
}: {
  imageUrl: string;
  initialRealWidthCm: number | null;
}) {
  const initialHeadWidthPercent = initialRealWidthCm ? (ASSUMED_HEAD_WIDTH_CM / initialRealWidthCm) * 100 : 30;
  const [leftPercent, setLeftPercent] = useState(50 - initialHeadWidthPercent / 2);
  const [rightPercent, setRightPercent] = useState(50 + initialHeadWidthPercent / 2);
  const [dragging, setDragging] = useState<"left" | "right" | null>(null);
  const [realWidthCm, setRealWidthCm] = useState(initialRealWidthCm ?? ASSUMED_HEAD_WIDTH_CM / (initialHeadWidthPercent / 100));
  const containerRef = useRef<HTMLDivElement>(null);

  function updateFromPointer(e: React.PointerEvent) {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const percent = Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, ((e.clientX - rect.left) / rect.width) * 100));
    let nextLeft = leftPercent;
    let nextRight = rightPercent;
    if (dragging === "left") nextLeft = Math.min(percent, rightPercent - 1);
    else nextRight = Math.max(percent, leftPercent + 1);
    setLeftPercent(nextLeft);
    setRightPercent(nextRight);
    setRealWidthCm(ASSUMED_HEAD_WIDTH_CM / ((nextRight - nextLeft) / 100));
  }

  const headWidthPercent = rightPercent - leftPercent;

  return (
    <div>
      <label className="mb-1 block text-sm text-neutral-600">
        実寸キャリブレーション（頭の横幅に合わせて左右のハンドルをドラッグすると下の数値欄に目安が入ります。数値欄は直接編集できます）
      </label>
      <div
        ref={containerRef}
        onPointerMove={updateFromPointer}
        onPointerUp={(e) => {
          if (dragging) (e.target as Element).releasePointerCapture(e.pointerId);
          setDragging(null);
        }}
        onPointerCancel={() => setDragging(null)}
        className="relative aspect-[3/4] w-full max-w-xs touch-none select-none overflow-hidden rounded-lg bg-neutral-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="pointer-events-none h-full w-full object-cover" draggable={false} />
        <div
          className="absolute top-0 h-full border-l-2 border-dashed border-pink-400"
          style={{ left: `${leftPercent}%`, width: `${headWidthPercent}%`, borderRight: "2px dashed #f472b6" }}
        />
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as Element).setPointerCapture(e.pointerId);
            setDragging("left");
          }}
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-2 border-white bg-pink-500 shadow"
          style={{ left: `${leftPercent}%` }}
        />
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as Element).setPointerCapture(e.pointerId);
            setDragging("right");
          }}
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-2 border-white bg-pink-500 shadow"
          style={{ left: `${rightPercent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <label htmlFor="realWidthCmInput" className="text-neutral-600">
          この写真の横幅の実寸（cm）
        </label>
        <input
          id="realWidthCmInput"
          name="realWidthCm"
          type="number"
          step="0.1"
          min={1}
          value={Number.isFinite(realWidthCm) ? Math.round(realWidthCm * 10) / 10 : ""}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (Number.isFinite(v) && v > 0) setRealWidthCm(v);
          }}
          className="w-24 rounded border border-neutral-300 px-2 py-1"
        />
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        ドラッグは目安を出すだけの補助です。実際に使われるのは上の数値欄の値なので、正確な実寸が分かっていれば直接入力してください。
      </p>
    </div>
  );
}
