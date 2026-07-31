import { GoogleGenAI } from "@google/genai";
import {
  COMPOSITE_PROMPT_VERSION,
  buildCompositePrompt,
  MULTI_COMPOSITE_PROMPT_VERSION,
  buildMultiPartCompositePrompt,
  BLEND_PROMPT_VERSION,
  buildBlendPrompt,
} from "./prompt-templates";

const MODEL = "gemini-2.5-flash-image";
const MAX_RETRIES = 2;

// UI上の上限は設けない方針だが、リクエストが異常に大きくなる事態を防ぐ技術的な安全弁。
// 通常利用では絶対に引っかからない想定の緩い上限。
export const HARD_SAFETY_LIMIT = 20;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

// Legacy fallback for parts/base photos without a real-world cm measurement registered yet, where
// lib/deterministic-composite.ts can't compute a target size — Gemini guesses scale from text/coin/
// exemplar hints instead. Prefer CompositeBlendInput whenever calibration data is available.
export type CompositeFromScratchInput = {
  mode: "compose";
  cutoutBytes: Uint8Array;
  cutoutMimeType: string;
  baseBytes: Uint8Array;
  baseMimeType: string;
  attachmentZone: string;
  sizeNote?: string | null;
  sizeReferenceBytes?: Uint8Array;
  sizeReferenceMimeType?: string;
  exemplarBytes?: Uint8Array;
  exemplarMimeType?: string;
};

// The validated, preferred path: size/position are already decided (computed from real-world cm
// measurements by lib/deterministic-composite.ts, not judged by Gemini) and baked into draftBytes.
// Gemini's only job is photorealistic blending — see buildBlendPrompt for why this is far more
// reliable than asking it to also decide scale, even with strongly-worded text instructions.
export type CompositeBlendInput = {
  mode: "blend";
  draftBytes: Uint8Array;
  draftMimeType: string;
  // Undownsized copy of the cutout — keeps fine detail legible for parts that shrink to a small,
  // hard-to-read size in the draft at their correct real-world scale.
  shapeReferenceBytes?: Uint8Array;
  shapeReferenceMimeType?: string;
  // An already-approved result for the SAME part on a DIFFERENT base photo — the deterministic
  // draft's size is mathematically correct, but Gemini's blend step still has some size variance
  // from call to call (observed directly: two blend calls from an identical, provably-correct
  // draft produced visibly different sizes). Showing a confirmed-good real photo of this exact
  // accessory at true scale gives Gemini a second, concrete anchor beyond the abstract cm math.
  crossPhotoExemplarBytes?: Uint8Array;
  crossPhotoExemplarMimeType?: string;
};

export type CompositeInput = CompositeFromScratchInput | CompositeBlendInput;

export type PartImageInput = {
  partId: string;
  label: string;
  sizeNote?: string | null;
  cutoutBytes: Uint8Array;
  cutoutMimeType: string;
  sizeReferenceBytes?: Uint8Array;
  sizeReferenceMimeType?: string;
};

export type MultiCompositeInput = {
  parts: PartImageInput[];
  baseBytes: Uint8Array;
  baseMimeType: string;
  attachmentZone: string;
  exemplarBytes?: Uint8Array;
  exemplarMimeType?: string;
  // Client-drawn rough draft (base photo + each selected part pasted at the position/rotation
  // the customer dragged it to) — sent as an extra reference image so the customer's chosen
  // layout is respected in the final photorealistic render instead of left to the model's guess.
  layoutBytes?: Uint8Array;
  layoutMimeType?: string;
};

export type CompositeResult = {
  imageBytes: Buffer;
  mimeType: string;
  promptVersion: string;
};

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ImagePart = { mimeType: string; base64: string };

/**
 * Sends a prompt + ordered images to Gemini 2.5 Flash Image, retrying transient failures
 * with exponential backoff. Throws after MAX_RETRIES exhausted so the caller can record a
 * `failed` status and let the flow retry later.
 */
async function generateWithRetry(prompt: string, images: ImagePart[], promptVersion: string): Promise<CompositeResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await getClient().models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
            ],
          },
        ],
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p) => p.inlineData?.data);

      if (!imagePart?.inlineData?.data) {
        throw new Error("Gemini response contained no image data");
      }

      return {
        imageBytes: Buffer.from(imagePart.inlineData.data, "base64"),
        mimeType: imagePart.inlineData.mimeType ?? "image/png",
        promptVersion,
      };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
      }
    }
  }

  throw new Error(
    `Gemini compositing failed after ${MAX_RETRIES + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

/** Composites a single part cutout onto a single base photo — used for admin solo-QA previews. */
export async function composePreview(input: CompositeInput): Promise<CompositeResult> {
  if (input.mode === "blend") {
    const hasShapeReference = Boolean(input.shapeReferenceBytes && input.shapeReferenceMimeType);
    const hasCrossPhotoExemplar = Boolean(input.crossPhotoExemplarBytes && input.crossPhotoExemplarMimeType);
    const prompt = buildBlendPrompt(hasShapeReference, hasCrossPhotoExemplar);
    const images: ImagePart[] = [{ mimeType: input.draftMimeType, base64: toBase64(input.draftBytes) }];
    if (hasShapeReference) {
      images.push({ mimeType: input.shapeReferenceMimeType!, base64: toBase64(input.shapeReferenceBytes!) });
    }
    if (hasCrossPhotoExemplar) {
      images.push({ mimeType: input.crossPhotoExemplarMimeType!, base64: toBase64(input.crossPhotoExemplarBytes!) });
    }
    return generateWithRetry(prompt, images, BLEND_PROMPT_VERSION);
  }

  const hasSizeReference = Boolean(input.sizeReferenceBytes && input.sizeReferenceMimeType);
  const hasExemplar = Boolean(input.exemplarBytes && input.exemplarMimeType);
  const prompt = buildCompositePrompt(input.attachmentZone, input.sizeNote, hasSizeReference, hasExemplar);

  const images: ImagePart[] = [{ mimeType: input.cutoutMimeType, base64: toBase64(input.cutoutBytes) }];
  if (hasSizeReference) {
    images.push({ mimeType: input.sizeReferenceMimeType!, base64: toBase64(input.sizeReferenceBytes!) });
  }
  if (hasExemplar) {
    images.push({ mimeType: input.exemplarMimeType!, base64: toBase64(input.exemplarBytes!) });
  }
  images.push({ mimeType: input.baseMimeType, base64: toBase64(input.baseBytes) });

  return generateWithRetry(prompt, images, COMPOSITE_PROMPT_VERSION);
}

/** Composites multiple selected part cutouts together onto a single base photo — the live customer-facing generation. */
export async function composeParts(input: MultiCompositeInput): Promise<CompositeResult> {
  if (input.parts.length === 0 || input.parts.length > HARD_SAFETY_LIMIT) {
    throw new Error(`parts count must be 1..${HARD_SAFETY_LIMIT}`);
  }

  const hasExemplar = Boolean(input.exemplarBytes && input.exemplarMimeType);
  const hasLayout = Boolean(input.layoutBytes && input.layoutMimeType);
  const prompt = buildMultiPartCompositePrompt(
    input.attachmentZone,
    input.parts.map((p) => ({
      label: p.label,
      sizeNote: p.sizeNote,
      hasSizeReference: Boolean(p.sizeReferenceBytes && p.sizeReferenceMimeType),
    })),
    hasExemplar,
    hasLayout
  );

  const images: ImagePart[] = [];
  for (const p of input.parts) {
    images.push({ mimeType: p.cutoutMimeType, base64: toBase64(p.cutoutBytes) });
    if (p.sizeReferenceBytes && p.sizeReferenceMimeType) {
      images.push({ mimeType: p.sizeReferenceMimeType, base64: toBase64(p.sizeReferenceBytes) });
    }
  }
  if (hasExemplar) {
    images.push({ mimeType: input.exemplarMimeType!, base64: toBase64(input.exemplarBytes!) });
  }
  if (hasLayout) {
    images.push({ mimeType: input.layoutMimeType!, base64: toBase64(input.layoutBytes!) });
  }
  images.push({ mimeType: input.baseMimeType, base64: toBase64(input.baseBytes) });

  return generateWithRetry(prompt, images, MULTI_COMPOSITE_PROMPT_VERSION);
}
