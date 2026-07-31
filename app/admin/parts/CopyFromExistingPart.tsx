"use client";

// Lets Saki pick an existing part (e.g. the same flower in a different color) and pre-fill this
// form's text/number fields from it, so registering a color variant doesn't mean re-measuring and
// re-typing the same real-world cm figure and other metadata every time. Deliberately does NOT
// copy color or any of the image files — those are the actual reason a new Part exists.
type CopySource = {
  id: string;
  description: string | null;
  sizeNote: string | null;
  realWidthCm: number | null;
  addOnPriceJpy: number;
  attachmentStyle: string;
  displayCategory: string | null;
};

function setFieldValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (field) field.value = value;
}

export default function CopyFromExistingPart({ parts }: { parts: (CopySource & { name: string })[] }) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const source = parts.find((p) => p.id === e.target.value);
    if (!source) return;
    const form = e.target.closest("form");
    if (!form) return;

    setFieldValue(form, "description", source.description ?? "");
    setFieldValue(form, "sizeNote", source.sizeNote ?? "");
    setFieldValue(form, "realWidthCm", source.realWidthCm != null ? String(source.realWidthCm) : "");
    setFieldValue(form, "addOnPriceJpy", String(source.addOnPriceJpy));
    setFieldValue(form, "attachmentStyle", source.attachmentStyle);
    setFieldValue(form, "displayCategory", source.displayCategory ?? "");

    e.target.value = "";
  }

  if (parts.length === 0) return null;

  return (
    <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 p-3">
      <label className="mb-1 block text-sm text-neutral-600">既存パーツから複製（任意）</label>
      <select defaultValue="" onChange={handleChange} className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm">
        <option value="" disabled>
          選択すると下の項目に値をコピーします
        </option>
        {parts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-neutral-500">
        同じ実物の色違いなど、サイズ・種類・装着スタイルが同じパーツを登録するときに使ってください。カラーと写真はコピーされません。
      </p>
    </div>
  );
}
