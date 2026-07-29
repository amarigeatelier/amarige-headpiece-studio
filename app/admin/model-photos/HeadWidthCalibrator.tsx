"use client";

import { useRef, useState } from "react";

const CLAMP_MIN = 1;
const CLAMP_MAX = 99;

// 成人女性の頭の横幅（耳から耳まで）の一般的な仮定値。プロンプト側の目安（14〜16cm）と揃えてある。
const ASSUMED_HEAD_WIDTH_CM = 15;

// 写真の中で頭の左端・右端をドラッグで指定してもらい、「頭は約15cm」という仮定から
// 写真全体の実寸（横幅cm）を逆算する。この値がパーツの実物cmとサイズ計算の基準になる。
export default function HeadWidthCalibrator({
  imageUrl,
  initialRealWidthCm,
}: {
  imageUrl: string;
  initialRealWidthCm: number | null;
}) {
  // realWidthCm から初期の左右ハンドル位置(%)を逆算（見つからなければ画面中央付近に仮配置）。
  const initialHeadWidthPercent = initialRealWidthCm ? (ASSUMED_HEAD_WIDTH_CM / initialRealWidthCm) * 100 : 30;
  const [leftPercent, setLeftPercent] = useState(50 - initialHeadWidthPercent / 2);
  const [rightPercent, setRightPercent] = useState(50 + initialHeadWidthPercent / 2);
  const [dragging, setDragging] = useState<"left" | "right" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function updateFromPointer(e: React.PointerEvent) {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const percent = Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, ((e.clientX - rect.left) / rect.width) * 100));
    if (dragging === "left") setLeftPercent(Math.min(percent, rightPercent - 1));
    else setRightPercent(Math.max(percent, leftPercent + 1));
  }

  const headWidthPercent = rightPercent - leftPercent;
  const photoRealWidthCm = ASSUMED_HEAD_WIDTH_CM / (headWidthPercent / 100);

  return (
    <div>
      <label className="mb-1 block text-sm text-neutral-600">
        実寸キャリブレーション（頭の横幅に合わせて左右のハンドルをドラッグしてください。成人女性の頭の横幅を約{ASSUMED_HEAD_WIDTH_CM}
        cmと仮定して、この写真全体の実寸を計算します）
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
      <p className="mt-1 text-xs text-neutral-500">
        この写真の横幅全体は約 <span className="font-medium text-neutral-700">{photoRealWidthCm.toFixed(1)}cm</span> として計算されます。
      </p>
      <input type="hidden" name="realWidthCm" value={photoRealWidthCm} />
    </div>
  );
}
