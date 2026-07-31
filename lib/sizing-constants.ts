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
