// 写真のうち実際にお花が写っている範囲(alphaのある部分)。写真の周りの透明な余白ごと大きさを
// 決めてしまうと、サーバー側の合成結果(余白を切り落としてから大きさを合わせる。
// lib/deterministic-composite.ts の keepLargestComponentBounds)より小さく/不揃いに見えてしまう。
// トレー配置画面(components/PartPlacer.tsx)とパーツ一覧のサムネイル(components/PartConfigurator.tsx)
// の両方が、この同じロジックで余白を除いた範囲を基準にサイズを揃える。値はすべて元画像に対する割合(0-1)。
export type ContentBox = { left: number; top: number; width: number; height: number; aspect: number };

const SCAN_MAX_EDGE = 400;
const ALPHA_THRESHOLD = 10;
const CONTENT_PADDING_PX = 4; // サーバー側のCONTENT_PADDING_PXと同じ

export function measureContentBox(url: string): Promise<ContentBox | null> {
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

// 正方形の枠にcontentAspect(横/縦)の中身をobject-fit:containと同じ考え方で収める時の幅・高さ(%)。
export function containInSquare(contentAspect: number): { width: string; height: string } {
  return contentAspect >= 1
    ? { width: "100%", height: `${100 / contentAspect}%` }
    : { width: `${100 * contentAspect}%`, height: "100%" };
}
