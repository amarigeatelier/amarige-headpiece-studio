"use client";

import { useCallback, useRef, useState } from "react";

export type PartLayout = { partId: string; xPercent: number; yPercent: number; rotationDeg: number };

type PlaceablePart = { id: string; cutoutImageUrl: string; name: string };

/** Spreads N parts around the center in a small ring so they don't start stacked on top of each other. */
export function defaultLayout(parts: PlaceablePart[], centerX = 50, centerY = 48): PartLayout[] {
  const radius = 10;
  return parts.map((p, i) => {
    if (parts.length === 1) return { partId: p.id, xPercent: centerX, yPercent: centerY, rotationDeg: 0 };
    const angle = (i / parts.length) * Math.PI * 2 - Math.PI / 2;
    return {
      partId: p.id,
      xPercent: centerX + Math.cos(angle) * radius,
      yPercent: centerY + Math.sin(angle) * radius * 0.7,
      rotationDeg: 0,
    };
  });
}

const CLAMP_MIN = 3;
const CLAMP_MAX = 97;

export default function PartPlacer({
  baseImageUrl,
  parts,
  layout,
  onChange,
}: {
  baseImageUrl: string;
  parts: PlaceablePart[];
  layout: PartLayout[];
  onChange: (next: PartLayout[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ partId: string; mode: "move" | "rotate" } | null>(null);

  const getLayout = useCallback((partId: string) => layout.find((l) => l.partId === partId), [layout]);

  function updatePart(partId: string, patch: Partial<PartLayout>) {
    onChange(layout.map((l) => (l.partId === partId ? { ...l, ...patch } : l)));
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const current = getLayout(drag.partId);
    if (!current) return;

    if (drag.mode === "move") {
      const xPercent = Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, ((e.clientX - rect.left) / rect.width) * 100));
      const yPercent = Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, ((e.clientY - rect.top) / rect.height) * 100));
      updatePart(drag.partId, { xPercent, yPercent });
    } else {
      const centerX = rect.left + (current.xPercent / 100) * rect.width;
      const centerY = rect.top + (current.yPercent / 100) * rect.height;
      const angleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const rotationDeg = Math.round((angleRad * 180) / Math.PI) + 90;
      updatePart(drag.partId, { rotationDeg });
    }
  }

  function startDrag(e: React.PointerEvent, partId: string, mode: "move" | "rotate") {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ partId, mode });
  }

  function endDrag(e: React.PointerEvent) {
    if (drag) (e.target as Element).releasePointerCapture(e.pointerId);
    setDrag(null);
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="relative aspect-[3/4] w-full touch-none select-none overflow-hidden rounded-lg bg-neutral-100"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={baseImageUrl} alt="" className="pointer-events-none h-full w-full object-cover" draggable={false} />

      {parts.map((part) => {
        const l = getLayout(part.id);
        if (!l) return null;
        return (
          <div
            key={part.id}
            style={{
              position: "absolute",
              left: `${l.xPercent}%`,
              top: `${l.yPercent}%`,
              transform: `translate(-50%, -50%) rotate(${l.rotationDeg}deg)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={part.cutoutImageUrl}
              alt={part.name}
              draggable={false}
              onPointerDown={(e) => startDrag(e, part.id, "move")}
              className="h-16 w-16 cursor-grab touch-none object-contain drop-shadow-md active:cursor-grabbing"
            />
            <div
              onPointerDown={(e) => startDrag(e, part.id, "rotate")}
              style={{ transform: "translateX(-50%)" }}
              className="absolute left-1/2 -top-5 h-4 w-4 cursor-grab touch-none rounded-full border-2 border-white bg-neutral-900 shadow active:cursor-grabbing"
              title="ドラッグで向きを調整"
            />
          </div>
        );
      })}
    </div>
  );
}
