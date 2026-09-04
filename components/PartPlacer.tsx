"use client";

import { useCallback, useRef, useState } from "react";

// Keyed by instanceId, not partId — the same part can now be selected more than once (e.g. two of
// the same flower), and each copy needs its own independent position/rotation.
export type PartLayout = { instanceId: string; partId: string; xPercent: number; yPercent: number; rotationDeg: number };

export type PlaceableInstance = { instanceId: string; partId: string; cutoutImageUrl: string; name: string };

/**
 * Spreads N instances around the center in a small ring so they don't start stacked on top of each
 * other. `existingCount` is how many OTHER instances are already placed elsewhere and staying put
 * (e.g. from an earlier selection) — the ring's angle step accounts for the full eventual total
 * (existingCount + instances.length) so a newly-added instance never lands exactly on top of an
 * already-placed one. Without this, adding a second copy of the same part one at a time (the normal
 * +/- quantity flow) would place every new copy at the same lone "total=1" center spot as the first.
 */
export function defaultLayout(instances: PlaceableInstance[], centerX = 50, centerY = 48, existingCount = 0): PartLayout[] {
  const radius = 10;
  const total = existingCount + instances.length;
  return instances.map((instance, i) => {
    if (total === 1) {
      return { instanceId: instance.instanceId, partId: instance.partId, xPercent: centerX, yPercent: centerY, rotationDeg: 0 };
    }
    const index = existingCount + i;
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    return {
      instanceId: instance.instanceId,
      partId: instance.partId,
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
  aspectRatio = 3 / 4,
  instances,
  layout,
  onChange,
}: {
  baseImageUrl: string;
  aspectRatio?: number;
  instances: PlaceableInstance[];
  layout: PartLayout[];
  onChange: (next: PartLayout[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ instanceId: string; mode: "move" | "rotate" } | null>(null);

  const getLayout = useCallback((instanceId: string) => layout.find((l) => l.instanceId === instanceId), [layout]);

  function updateInstance(instanceId: string, patch: Partial<PartLayout>) {
    onChange(layout.map((l) => (l.instanceId === instanceId ? { ...l, ...patch } : l)));
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const current = getLayout(drag.instanceId);
    if (!current) return;

    if (drag.mode === "move") {
      const xPercent = Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, ((e.clientX - rect.left) / rect.width) * 100));
      const yPercent = Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, ((e.clientY - rect.top) / rect.height) * 100));
      updateInstance(drag.instanceId, { xPercent, yPercent });
    } else {
      const centerX = rect.left + (current.xPercent / 100) * rect.width;
      const centerY = rect.top + (current.yPercent / 100) * rect.height;
      const angleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const rotationDeg = Math.round((angleRad * 180) / Math.PI) + 90;
      updateInstance(drag.instanceId, { rotationDeg });
    }
  }

  function startDrag(e: React.PointerEvent, instanceId: string, mode: "move" | "rotate") {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ instanceId, mode });
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
      className="relative w-full touch-none select-none overflow-hidden rounded-lg bg-neutral-100"
      style={{ aspectRatio }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={baseImageUrl} alt="" className="pointer-events-none h-full w-full object-cover" draggable={false} />

      {instances.map((instance) => {
        const l = getLayout(instance.instanceId);
        if (!l) return null;
        return (
          <div
            key={instance.instanceId}
            style={{
              position: "absolute",
              left: `${l.xPercent}%`,
              top: `${l.yPercent}%`,
              transform: `translate(-50%, -50%) rotate(${l.rotationDeg}deg)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={instance.cutoutImageUrl}
              alt={instance.name}
              draggable={false}
              onPointerDown={(e) => startDrag(e, instance.instanceId, "move")}
              className="h-16 w-16 cursor-grab touch-none object-contain drop-shadow-md active:cursor-grabbing"
            />
            <div
              onPointerDown={(e) => startDrag(e, instance.instanceId, "rotate")}
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
