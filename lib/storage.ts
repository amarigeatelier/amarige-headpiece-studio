import { createClient, SupabaseClient } from "@supabase/supabase-js";

const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "previews";

// Service-role client: server-side only, never import this from client components.
// Created lazily (not at module load) so pages that merely import this file don't
// throw during `next build`'s static analysis when env vars aren't present yet.
let _supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set");
    }
    _supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  }
  return _supabaseAdmin;
}

/**
 * Uploads a binary image (raw bytes) to the storage bucket and returns its public URL.
 */
export async function uploadImage(
  path: string,
  bytes: Uint8Array | Buffer,
  contentType: string
): Promise<string> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });

  if (error) {
    throw new Error(`Supabase upload failed for ${path}: ${error.message}`);
  }

  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Downloads an image already stored in the bucket (or fetches an external URL) as bytes,
 * for feeding into the Gemini compositing call.
 */
export async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch image at ${url}: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "image/png";
  const arrayBuffer = await res.arrayBuffer();
  return { bytes: new Uint8Array(arrayBuffer), contentType };
}

export function soloPreviewImagePath(partId: string, basePhotoId: string) {
  return `part-solo-previews/${partId}/${basePhotoId}.png`;
}

export function compositeImagePath(combinationKey: string) {
  return `generated-composites/${combinationKey}.png`;
}

// `key` is caller-generated (crypto.randomUUID()) so the upload can happen before the
// DB row exists — no ordering dependency on an auto-generated id.
export function cutoutImagePath(key: string, fileName: string) {
  return `cutouts/${key}/${fileName}`;
}

// Coin/ruler reference photos used only as an extra Gemini input for scale accuracy —
// never shown to customers, so kept in a separate path from the customer-facing cutout.
export function sizeReferenceImagePath(key: string, fileName: string) {
  return `size-references/${key}/${fileName}`;
}

// Same item as the cutout but with the comb/pin/clip attachment mechanism manually edited out —
// used as the AI compositing input instead of the (still customer-facing) cutout when present,
// since asking Gemini to visually identify and hide the mechanism itself proved unreliable.
export function compositingImagePath(key: string, fileName: string) {
  return `compositing-images/${key}/${fileName}`;
}

export function modelPhotoPath(key: string, fileName: string) {
  return `model-photos/${key}/${fileName}`;
}

// A single admin-curated "correct scale looks like this" completed example, sent as an
// extra reference image on every generation to anchor how big accessories should read
// relative to hair — text cm figures and a coin photo alone still undersold this in testing.
export function scaleExemplarImagePath(key: string, fileName: string) {
  return `scale-exemplar/${key}/${fileName}`;
}
