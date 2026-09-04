"use client";

import { useEffect, useMemo, useState } from "react";
import PartPlacer, { defaultLayout, type PartLayout, type PlaceableInstance } from "./PartPlacer";

type BasePhoto = {
  id: string;
  label: string;
  imageUrl: string;
  defaultAttachmentXPercent: number;
  defaultAttachmentYPercent: number;
  realWidthCm: number | null;
};

type Part = {
  id: string;
  name: string;
  cutoutImageUrl: string;
  compositingImageUrl: string | null;
  addOnPriceJpy: number;
  displayCategory: string | null;
  color: string | null;
  realWidthCm: number | null;
};

// One selected copy of a part — the same partId can appear more than once (customer chose "2個").
type Instance = { instanceId: string; partId: string };

const MAX_QUANTITY_PER_PART = 10;
// パーツ一覧のサムネイルは全カード同じ枠なので、実物の大小関係が伝わらない(saki指摘)。
// 一番大きいパーツ(基準は胡蝶蘭)を基準の100%とし、他は実寸cmの比率で縮小表示する。
// 極端に小さいパーツが点のようになって見えなくなるのを防ぐため下限を設ける。
const THUMBNAIL_MIN_SCALE_FRACTION = 0.3;

function makeInstanceId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export default function PartConfigurator({
  basePhotos,
  parts,
  basePriceJpy,
}: {
  basePhotos: BasePhoto[];
  parts: Part[];
  basePriceJpy: number;
}) {
  const [basePhotoId, setBasePhotoId] = useState<string | null>(basePhotos[0]?.id ?? null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<{ compositeId: string; imageUrl: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [purchasingCredits, setPurchasingCredits] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState<PartLayout[]>([]);
  // ベース写真ごとの実際の縦横比。旧デザイン(縦長の頭の写真)を前提に固定で3:4にしていたが、
  // トレー写真のような横長の写真だとそのまま3:4の枠に詰め込まれて大きく切り取られてしまう
  // (実際に発生した不具合)。写真ごとに実寸の比率を読み取って枠に反映することで、どんな縦横比の
  // 写真でも(パーツの配置座標が枠基準のままでも)正しく収まるようにする。
  const [aspectRatio, setAspectRatio] = useState(3 / 4);

  useEffect(() => {
    const base = basePhotos.find((b) => b.id === basePhotoId);
    if (!base) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setAspectRatio(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = base.imageUrl;
  }, [basePhotoId, basePhotos]);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const partsById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);

  const maxRealWidthCm = useMemo(() => {
    const widths = parts.map((p) => p.realWidthCm).filter((w): w is number => w != null && w > 0);
    return widths.length > 0 ? Math.max(...widths) : null;
  }, [parts]);

  function thumbnailScaleFraction(part: Part): number {
    if (maxRealWidthCm == null || part.realWidthCm == null) return 1;
    return Math.max(THUMBNAIL_MIN_SCALE_FRACTION, Math.min(1, part.realWidthCm / maxRealWidthCm));
  }

  const categoryOptions = useMemo(
    () => Array.from(new Set(parts.map((p) => p.displayCategory).filter((c): c is string => Boolean(c)))).sort(),
    [parts]
  );
  const colorOptions = useMemo(
    () => Array.from(new Set(parts.map((p) => p.color).filter((c): c is string => Boolean(c)))).sort(),
    [parts]
  );

  function toggleFilter(set: Set<string>, setSet: (next: Set<string>) => void, value: string) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  }

  const filteredParts = useMemo(() => {
    return parts.filter((p) => {
      const categoryMatch = selectedCategories.size === 0 || (p.displayCategory && selectedCategories.has(p.displayCategory));
      const colorMatch = selectedColors.size === 0 || (p.color && selectedColors.has(p.color));
      return categoryMatch && colorMatch;
    });
  }, [parts, selectedCategories, selectedColors]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Part[]>();
    for (const part of filteredParts) {
      const key = part.displayCategory ?? "その他";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(part);
    }
    return Array.from(groups.entries());
  }, [filteredParts]);

  // partId -> how many copies are currently selected, for the quantity steppers and price.
  const quantities = useMemo(() => {
    const map = new Map<string, number>();
    for (const instance of instances) map.set(instance.partId, (map.get(instance.partId) ?? 0) + 1);
    return map;
  }, [instances]);

  const totalPriceJpy = useMemo(() => {
    const addOn = instances.reduce((sum, instance) => sum + (partsById.get(instance.partId)?.addOnPriceJpy ?? 0), 0);
    return basePriceJpy + addOn;
  }, [instances, partsById, basePriceJpy]);

  const selectedInstances = useMemo<PlaceableInstance[]>(
    () =>
      instances
        .map((instance) => {
          const part = partsById.get(instance.partId);
          if (!part) return null;
          return {
            instanceId: instance.instanceId,
            partId: part.id,
            cutoutImageUrl: part.cutoutImageUrl,
            name: part.name,
            scaleFraction: thumbnailScaleFraction(part),
          };
        })
        .filter((x): x is PlaceableInstance => x !== null),
    [instances, partsById, maxRealWidthCm]
  );
  const currentBasePhoto = useMemo(() => basePhotos.find((b) => b.id === basePhotoId), [basePhotos, basePhotoId]);

  // Derives nextInstances from the PREVIOUS state via updater functions (not the `instances`
  // closure variable) so two quantity-button clicks in quick succession — which React can batch
  // into the same tick before either has re-rendered — each apply on top of the other instead of
  // one silently clobbering the other's change.
  function setInstancesAndSyncLayout(updateInstances: (prev: Instance[]) => Instance[]) {
    setInstances((prevInstances) => {
      const nextInstances = updateInstances(prevInstances);
      setLayout((prevLayout) => {
        const nextIds = new Set(nextInstances.map((i) => i.instanceId));
        const kept = prevLayout.filter((l) => nextIds.has(l.instanceId));
        const missing = nextInstances
          .filter((i) => !kept.some((l) => l.instanceId === i.instanceId))
          .map((i) => {
            const part = partsById.get(i.partId);
            return part
              ? {
                  instanceId: i.instanceId,
                  partId: part.id,
                  cutoutImageUrl: part.cutoutImageUrl,
                  name: part.name,
                  scaleFraction: thumbnailScaleFraction(part),
                }
              : null;
          })
          .filter((x): x is PlaceableInstance => x !== null);
        if (missing.length === 0 && kept.length === prevLayout.length) return prevLayout;
        return [
          ...kept,
          ...defaultLayout(missing, currentBasePhoto?.defaultAttachmentXPercent, currentBasePhoto?.defaultAttachmentYPercent, kept.length),
        ];
      });
      return nextInstances;
    });
  }

  function incrementPart(partId: string) {
    setInstancesAndSyncLayout((prev) => {
      const currentQty = prev.filter((i) => i.partId === partId).length;
      if (currentQty >= MAX_QUANTITY_PER_PART) return prev;
      return [...prev, { instanceId: makeInstanceId(), partId }];
    });
    setPreview(null);
  }

  function decrementPart(partId: string) {
    setInstancesAndSyncLayout((prev) => {
      const lastIndex = [...prev].reverse().findIndex((i) => i.partId === partId);
      if (lastIndex === -1) return prev;
      const removeAt = prev.length - 1 - lastIndex;
      return prev.filter((_, idx) => idx !== removeAt);
    });
    setPreview(null);
  }

  function selectBasePhoto(id: string) {
    setBasePhotoId(id);
    setPreview(null);
  }

  async function handleGeneratePreview() {
    if (!basePhotoId || instances.length === 0 || !isEmailValid) return;
    const basePhoto = basePhotos.find((b) => b.id === basePhotoId);
    if (!basePhoto) return;
    setGenerating(true);
    setError(null);
    setLimitReached(false);
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basePhotoId,
          instances: instances.map((i) => ({ instanceId: i.instanceId, partId: i.partId })),
          email,
          layout,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.limitReached) setLimitReached(true);
        throw new Error(body.error ?? "プレビューの生成に失敗しました");
      }
      setPreview({ compositeId: body.compositeId, imageUrl: body.imageUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "プレビューの生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  }

  async function handlePurchaseCredits() {
    setPurchasingCredits(true);
    setError(null);
    try {
      const res = await fetch("/api/credits/checkout", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.url) {
        throw new Error(body.error ?? "購入手続きの開始に失敗しました");
      }
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "購入手続きの開始に失敗しました");
      setPurchasingCredits(false);
    }
  }

  async function handleBuy() {
    if (!basePhotoId || !preview) return;
    setBuying(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basePhotoId,
          partIds: instances.map((i) => i.partId),
          compositeId: preview.compositeId,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) {
        throw new Error(body.error ?? "購入手続きの開始に失敗しました");
      }
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "購入手続きの開始に失敗しました");
      setBuying(false);
    }
  }

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <div>
        {preview ? (
          <>
            <div className="w-full overflow-hidden rounded-lg bg-neutral-100" style={{ aspectRatio }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.imageUrl} alt="生成されたプレビュー" className="h-full w-full object-cover" />
            </div>
            <button
              onClick={() => setPreview(null)}
              className="mt-2 w-full rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-700"
            >
              位置を調整し直す
            </button>
          </>
        ) : (() => {
            const base = basePhotos.find((b) => b.id === basePhotoId);
            if (!base) {
              return (
                <div
                  className="flex w-full items-center justify-center rounded-lg bg-neutral-100 text-sm text-neutral-400"
                  style={{ aspectRatio }}
                >
                  ベース写真を選んでください
                </div>
              );
            }
            if (selectedInstances.length === 0) {
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={base.imageUrl}
                  alt={base.label}
                  className="w-full rounded-lg object-cover opacity-60"
                  style={{ aspectRatio }}
                />
              );
            }
            return (
              <PartPlacer
                baseImageUrl={base.imageUrl}
                aspectRatio={aspectRatio}
                instances={selectedInstances}
                layout={layout}
                onChange={setLayout}
              />
            );
          })()}

        {!preview && selectedInstances.length > 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            パーツをドラッグして位置を調整できます（丸いつまみをドラッグすると向きも変えられます）。触らなければそのままの配置で生成されます。
          </p>
        )}

        {basePhotos.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {basePhotos.map((b) => (
              <button
                key={b.id}
                onClick={() => selectBasePhoto(b.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  b.id === basePhotoId ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-600"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}

        {!preview && (
          <div className="mt-4">
            <label className="mb-1 block text-sm text-neutral-600">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.com"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-500">プレビュー生成のご連絡・見積もりのお問い合わせに使用します。</p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {limitReached && (
          <button
            onClick={handlePurchaseCredits}
            disabled={purchasingCredits}
            className="mt-2 w-full rounded border border-amber-500 bg-amber-50 py-2 text-sm font-medium text-amber-800 disabled:opacity-50"
          >
            {purchasingCredits ? "手続き中..." : "追加で10回分を購入する（¥300）"}
          </button>
        )}

        <button
          onClick={handleGeneratePreview}
          disabled={!basePhotoId || instances.length === 0 || !isEmailValid || generating}
          className="mt-4 w-full rounded border border-neutral-900 py-2 text-sm font-medium text-neutral-900 disabled:opacity-40"
        >
          {generating ? "生成中..." : "プレビューを生成する"}
        </button>

        <button
          onClick={handleBuy}
          disabled={!preview || buying}
          className="mt-2 w-full rounded bg-neutral-900 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {buying ? "手続き中..." : `購入する（¥${totalPriceJpy.toLocaleString()}）`}
        </button>
      </div>

      <div>
        <p className="mb-4 text-lg font-semibold">合計 ¥{totalPriceJpy.toLocaleString()}</p>

        {(categoryOptions.length > 0 || colorOptions.length > 0) && (
          <div className="mb-6 space-y-3">
            {categoryOptions.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">種類で絞り込み</p>
                <div className="flex flex-wrap gap-2">
                  {categoryOptions.map((category) => (
                    <button
                      key={category}
                      onClick={() => toggleFilter(selectedCategories, setSelectedCategories, category)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        selectedCategories.has(category)
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 text-neutral-600"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {colorOptions.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">カラーで絞り込み</p>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      onClick={() => toggleFilter(selectedColors, setSelectedColors, color)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        selectedColors.has(color)
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 text-neutral-600"
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-6">
          {grouped.map(([category, categoryParts]) => (
            <div key={category}>
              <h3 className="mb-2 text-sm font-medium text-neutral-600">{category}</h3>
              <div className="grid grid-cols-3 gap-2">
                {categoryParts.map((part) => {
                  const qty = quantities.get(part.id) ?? 0;
                  return (
                    <div
                      key={part.id}
                      className={`overflow-hidden rounded-lg border text-left ${
                        qty > 0 ? "border-neutral-900 ring-2 ring-neutral-900" : "border-neutral-200"
                      }`}
                    >
                      <div className="flex aspect-square w-full items-center justify-center bg-neutral-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={part.cutoutImageUrl}
                          alt={part.name}
                          className="h-full w-full object-contain"
                          style={{ transform: `scale(${thumbnailScaleFraction(part)})` }}
                        />
                      </div>
                      <div className="p-1.5 text-xs">
                        <p className="truncate font-medium">{part.name}</p>
                        <p className="text-neutral-500">＋¥{part.addOnPriceJpy.toLocaleString()}</p>
                        <div className="mt-1 flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => decrementPart(part.id)}
                            disabled={qty === 0}
                            className="flex h-6 w-6 items-center justify-center rounded border border-neutral-300 text-sm leading-none disabled:opacity-30"
                            aria-label={`${part.name}を1個減らす`}
                          >
                            −
                          </button>
                          <span className="w-4 text-center font-medium">{qty}</span>
                          <button
                            type="button"
                            onClick={() => incrementPart(part.id)}
                            disabled={qty >= MAX_QUANTITY_PER_PART}
                            className="flex h-6 w-6 items-center justify-center rounded border border-neutral-300 text-sm leading-none disabled:opacity-30"
                            aria-label={`${part.name}を1個増やす`}
                          >
                            ＋
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {parts.length === 0 && <p className="text-sm text-neutral-500">現在選べるパーツがありません。</p>}
          {parts.length > 0 && filteredParts.length === 0 && (
            <p className="text-sm text-neutral-500">条件に合うパーツがありません。絞り込みを変更してください。</p>
          )}
        </div>
      </div>
    </div>
  );
}
