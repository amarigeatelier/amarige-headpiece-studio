// Shared between the client-side manual sizer (app/admin/parts/PartSizer.tsx) and the server-side
// auto-calibrated draft builder (lib/actions/parts.ts), so both clamp part width to the same
// sane range regardless of which one computed it.
//
// MIN_WIDTH_PERCENT was originally 5, which turned out to be too close to real calibrated values —
// a genuinely small accessory (e.g. 2.3cm) on a wide-crop base photo (e.g. 41cm) calculates to
// ~5.6%, landing right at the floor. When a part's baseline is already at/near the floor, PartSizer's
// relative-% UI (a fraction of the baseline) has nowhere left to go below 100%, so "shrink further"
// becomes literally impossible to select — confirmed directly: a part's stored layoutWidthPercent
// was clamped to exactly 5, and the admin could not move the slider below 100% at all. Lowered to
// 1 so the floor only guards against literal zero/negative, not realistic small accessories.
export const MIN_WIDTH_PERCENT = 1;
export const MAX_WIDTH_PERCENT = 60;
export const DEFAULT_WIDTH_PERCENT = 20;

// Was applied to the mathematically-correct calibrated size before it's used as the auto-generation
// target (lib/actions/parts.ts), as a hedge against Gemini's photorealistic blend step rendering the
// accessory bigger than instructed — every sizing miss up through that two-step "deterministic draft
// + Gemini blend" pipeline erred in that one direction, so aiming a bit small up front cut down on
// manual re-adjustment.
//
// That pipeline no longer exists: lib/deterministic-composite.ts's mechanicalComposite pastes the
// cutout at the exact computed pixel size with no Gemini judgment involved at all, so there is no
// inflation risk left to hedge against. Left at 0.8, this margin was pure unexplained shrinkage —
// confirmed directly: an アネモネ part came out ~6.8% width on a photo where the equivalent
// Gemini-guessed placement (before calibration existed) looked correct at ~12%, and even the
// uncalibrated math (~8.5%, no margin) would have been closer than the margined result. Kept at 1.0
// (i.e. inert) rather than deleted, in case a real hedge is needed again for some future pipeline.
export const AUTO_SIZE_SAFETY_MARGIN = 1.0;

// Was 1.4 (see git history), calibrated back when every base photo was a "worn on a head" product
// shot — a slightly-larger-than-true-life accessory read better against busy hair in that context.
// Reset to 1.0 (inert) on 2026-09-03: saki confirmed a 4cm-real part was rendering visibly bigger
// than 4cm on every base photo (tray AND both 和装 kimono photos, so this wasn't a tray-specific
// miscalibration) — with the tray now the primary/only customer-facing context, true-to-life scale
// is the actual goal (an honest "what you'll get" preview), not "reads well as a product photo".
export const VISUAL_SIZE_BOOST = 1.0;

// Used only when neither the part nor the base photo has a real-world cm measurement registered
// yet — keeps generation/preview working (imprecise size) rather than blocking it.
export const FALLBACK_WIDTH_PERCENT = 18;

// The one true formula for "how wide should this part render, as % of the base photo's width" —
// shared by the server (app/api/preview/route.ts, lib/actions/parts.ts) and the client-side tray
// placer (components/PartConfigurator.tsx), so the size a customer sees while positioning a part is
// exactly the size the actual generated composite will use, not a separately-tuned approximation.
// Returns null (rather than FALLBACK_WIDTH_PERCENT) when calibration data is missing, so each call
// site can decide its own fallback instead of this function silently picking one.
export function computeCalibratedWidthPercent(partRealWidthCm: number | null, baseRealWidthCm: number | null): number | null {
  if (partRealWidthCm == null || baseRealWidthCm == null) return null;
  return Math.min(
    MAX_WIDTH_PERCENT,
    Math.max(MIN_WIDTH_PERCENT, (partRealWidthCm / baseRealWidthCm) * 100 * AUTO_SIZE_SAFETY_MARGIN * VISUAL_SIZE_BOOST)
  );
}
