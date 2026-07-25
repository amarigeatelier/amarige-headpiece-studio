"use client";

import { useMemo, useState } from "react";

type BasePhoto = {
  id: string;
  label: string;
  imageUrl: string;
};

type Part = {
  id: string;
  name: string;
  cutoutImageUrl: string;
  addOnPriceJpy: number;
  displayCategory: string | null;
  color: string | null;
};

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
  const [selectedPartIds, setSelectedPartIds] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<{ compositeId: string; imageUrl: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [purchasingCredits, setPurchasingCredits] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

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

  const totalPriceJpy = useMemo(() => {
    const addOn = parts
      .filter((p) => selectedPartIds.has(p.id))
      .reduce((sum, p) => sum + p.addOnPriceJpy, 0);
    return basePriceJpy + addOn;
  }, [parts, selectedPartIds, basePriceJpy]);

  function togglePart(partId: string) {
    setSelectedPartIds((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
    setPreview(null);
  }

  function selectBasePhoto(id: string) {
    setBasePhotoId(id);
    setPreview(null);
  }

  async function handleGeneratePreview() {
    if (!basePhotoId || selectedPartIds.size === 0 || !isEmailValid) return;
    setGenerating(true);
    setError(null);
    setLimitReached(false);
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basePhotoId, partIds: Array.from(selectedPartIds), email }),
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
          partIds: Array.from(selectedPartIds),
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
        <div className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-neutral-100">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.imageUrl} alt="生成されたプレビュー" className="h-full w-full object-cover" />
          ) : (
            (() => {
              const base = basePhotos.find((b) => b.id === basePhotoId);
              return base ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={base.imageUrl} alt={base.label} className="h-full w-full object-cover opacity-60" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                  ベース写真を選んでください
                </div>
              );
            })()
          )}
        </div>

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
          disabled={!basePhotoId || selectedPartIds.size === 0 || !isEmailValid || generating}
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
                  const selected = selectedPartIds.has(part.id);
                  return (
                    <button
                      key={part.id}
                      onClick={() => togglePart(part.id)}
                      className={`overflow-hidden rounded-lg border text-left ${
                        selected ? "border-neutral-900 ring-2 ring-neutral-900" : "border-neutral-200"
                      }`}
                    >
                      <div className="aspect-square w-full bg-neutral-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={part.cutoutImageUrl} alt={part.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="p-1.5 text-xs">
                        <p className="truncate font-medium">{part.name}</p>
                        <p className="text-neutral-500">＋¥{part.addOnPriceJpy.toLocaleString()}</p>
                      </div>
                    </button>
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
