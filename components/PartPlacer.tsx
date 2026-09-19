"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Keyed by instanceId, not partId — the same part can now be selected more than once (e.g. two of
// the same flower), and each copy needs its own independent position/rotation.
export type PartLayout = { instanceId: string; partId: string; xPercent: number; yPercent: number; rotationDeg: number };

export type PlaceableInstance = {
  instanceId: string;
  partId: string;
  cutoutImageUrl: string;
  name: string;
  // ベース写真の横幅に対する実寸cm比率(%) — /api/preview(lib/sizing-constants.computeCalibratedWidthPercent)
  // が実際の合成で使うのと全く同じ値。これにより配置画面での見た目のサイズが、生成後の実際の
  // 仕上がりサイズとそのまま一致する(saki指摘:「パーツを選んだ時点でもう正しいサイズで出て」)。
  widthPercent: number;
};

export type ReorderDirection = "front" | "back";

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
// 回転できることに気づきにくいという指摘(saki)への対応: 一番最初にパーツを選択した時だけ
// 「ドラッグすると向きを変えられます」と一度だけ吹き出しで説明する。localStorageに記録して、
// 一度見た後は同じブラウザで二度と出さない。
const ROTATE_HINT_STORAGE_KEY = "amarige_rotate_hint_shown";

// 写真のうち実際にお花が写っている範囲(alphaのある部分)。写真の周りの透明な余白ごと大きさを
// 決めてしまうと、生成結果(余白を切り落としてから大きさを合わせる)より小さく見えてしまうので、
// サーバー側(lib/deterministic-composite.ts の keepLargestComponentBounds)と同じく、
// 余白を除いた範囲でサイズを合わせる。値はすべて元画像に対する割合(0-1)。
type ContentBox = { left: number; top: number; width: number; height: number; aspect: number };

const SCAN_MAX_EDGE = 400;
const ALPHA_THRESHOLD = 10;
const CONTENT_PADDING_PX = 4; // サーバー側のCONTENT_PADDING_PXと同じ

function measureContentBox(url: string): Promise<ContentBox | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;
        if (!naturalW || !naturalH) return resolve(null);
        const scale = Math.min(1, SCAN_MAX_EDGE / Math.max(naturalW, naturalH));
        const w = Math.max(1, Math.round(naturalW * scale));
        const h = Math.max(1, Math.round(naturalH * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] >= ALPHA_THRESHOLD) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return resolve(null);
        const padX = CONTENT_PADDING_PX / naturalW;
        const padY = CONTENT_PADDING_PX / naturalH;
        const left = Math.max(0, minX / w - padX);
        const top = Math.max(0, minY / h - padY);
        const right = Math.min(1, (maxX + 1) / w + padX);
        const bottom = Math.min(1, (maxY + 1) / h + padY);
        const box = { left, top, width: right - left, height: bottom - top, aspect: naturalW / naturalH };
        // 余白がほとんどない(=透過していない)写真は、切り取っても意味がないのでそのまま使う
        resolve(box.width > 0.98 && box.height > 0.98 ? null : box);
      } catch {
        resolve(null); // CORSなどで読み取れない場合は従来どおり写真全体で表示
      }
    };
    img.src = url;
  });
}

export default function PartPlacer({
  baseImageUrl,
  aspectRatio = 3 / 4,
  instances,
  layout,
  onChange,
  onReorder,
}: {
  baseImageUrl: string;
  aspectRatio?: number;
  instances: PlaceableInstance[];
  layout: PartLayout[];
  onChange: (next: PartLayout[]) => void;
  // 重なり順の変更。instances配列の並び順=描画順(後ろの要素が上に乗る)をそのまま
  // /api/preview送信時の合成順としても使うので、ここでの並び替えが生成結果にも反映される。
  onReorder: (instanceId: string, direction: ReorderDirection) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ instanceId: string; mode: "move" | "rotate" } | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [showRotateHint, setShowRotateHint] = useState(false);
  const [contentBoxes, setContentBoxes] = useState<Record<string, ContentBox | null>>({});

  useEffect(() => {
    const pending = Array.from(new Set(instances.map((i) => i.cutoutImageUrl))).filter((url) => !(url in contentBoxes));
    if (pending.length === 0) return;
    let cancelled = false;
    Promise.all(pending.map(async (url) => [url, await measureContentBox(url)] as const)).then((results) => {
      if (cancelled) return;
      setContentBoxes((prev) => ({ ...prev, ...Object.fromEntries(results) }));
    });
    return () => {
      cancelled = true;
    };
  }, [instances, contentBoxes]);

  useEffect(() => {
    if (!selectedInstanceId) {
      setShowRotateHint(false);
      return;
    }
    let alreadySeen = true;
    try {
      alreadySeen = localStorage.getItem(ROTATE_HINT_STORAGE_KEY) === "1";
    } catch {
      alreadySeen = true; // localStorageが使えない環境ではしつこく出さない
    }
    setShowRotateHint(!alreadySeen);
    if (!alreadySeen) {
      try {
        localStorage.setItem(ROTATE_HINT_STORAGE_KEY, "1");
      } catch {
        // ignore
      }
    }
  }, [selectedInstanceId]);

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
    setSelectedInstanceId(instanceId);
    if (mode === "rotate") setShowRotateHint(false);
    setDrag({ instanceId, mode });
  }

  function endDrag(e: React.PointerEvent) {
    if (drag) (e.target as Element).releasePointerCapture(e.pointerId);
    setDrag(null);
  }

  // ベース写真の何もない部分(パーツの下に隠れているbase img自体)をタップしたら選択解除。
  // base imgはpointer-events-noneなので、その上でのpointerdownはこのcontainer自身がターゲットになる。
  function handleContainerPointerDown(e: React.PointerEvent) {
    if (e.target === containerRef.current) setSelectedInstanceId(null);
  }

  const selectedInstance = instances.find((i) => i.instanceId === selectedInstanceId);

  return (
    <div>
      <div
        ref={containerRef}
        onPointerDown={handleContainerPointerDown}
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
                width: `${instance.widthPercent}%`,
                transform: `translate(-50%, -50%) rotate(${l.rotationDeg}deg)`,
                outline: instance.instanceId === selectedInstanceId ? "2px dashed rgba(23,23,23,0.5)" : undefined,
                outlineOffset: 2,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {contentBoxes[instance.cutoutImageUrl] ? (
                <div
                  className="relative w-full overflow-hidden"
                  style={{
                    aspectRatio: `${contentBoxes[instance.cutoutImageUrl]!.width * contentBoxes[instance.cutoutImageUrl]!.aspect} / ${contentBoxes[instance.cutoutImageUrl]!.height}`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={instance.cutoutImageUrl}
                    alt={instance.name}
                    draggable={false}
                    onPointerDown={(e) => startDrag(e, instance.instanceId, "move")}
                    className="absolute max-w-none cursor-grab touch-none drop-shadow-md active:cursor-grabbing"
                    style={{
                      width: `${100 / contentBoxes[instance.cutoutImageUrl]!.width}%`,
                      height: `${100 / contentBoxes[instance.cutoutImageUrl]!.height}%`,
                      left: `${(-contentBoxes[instance.cutoutImageUrl]!.left / contentBoxes[instance.cutoutImageUrl]!.width) * 100}%`,
                      top: `${(-contentBoxes[instance.cutoutImageUrl]!.top / contentBoxes[instance.cutoutImageUrl]!.height) * 100}%`,
                    }}
                  />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={instance.cutoutImageUrl}
                  alt={instance.name}
                  draggable={false}
                  onPointerDown={(e) => startDrag(e, instance.instanceId, "move")}
                  className="h-auto w-full cursor-grab touch-none object-contain drop-shadow-md active:cursor-grabbing"
                />
              )}
              {instance.instanceId === selectedInstanceId && (
                <>
                  {showRotateHint && (
                    <div
                      className="absolute left-1/2 -top-16 w-max max-w-[10rem] -translate-x-1/2 rounded bg-neutral-900 px-2 py-1 text-center text-[11px] leading-tight text-white shadow-lg"
                      style={{ transform: "translateX(-50%)" }}
                    >
                      ドラッグすると向きを変えられます
                      <div
                        className="absolute left-1/2 top-full h-0 w-0 border-4 border-transparent border-t-neutral-900"
                        style={{ transform: "translateX(-50%)" }}
                      />
                    </div>
                  )}
                  <div
                    onPointerDown={(e) => startDrag(e, instance.instanceId, "rotate")}
                    style={{ transform: "translateX(-50%)" }}
                    className="absolute left-1/2 -top-5 h-4 w-4 cursor-grab touch-none rounded-full border-2 border-white bg-neutral-900 shadow active:cursor-grabbing"
                    title="ドラッグで向きを調整"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {selectedInstance && (
        <div className="mt-2 flex items-center justify-between rounded border border-neutral-200 bg-white px-3 py-2 text-sm">
          <span className="text-neutral-600">{selectedInstance.name}を選択中</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onReorder(selectedInstance.instanceId, "back")}
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            >
              背面へ
            </button>
            <button
              type="button"
              onClick={() => onReorder(selectedInstance.instanceId, "front")}
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            >
              前面へ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
