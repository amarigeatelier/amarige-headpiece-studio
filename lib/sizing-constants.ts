// Shared between the client-side manual sizer (app/admin/parts/PartSizer.tsx) and the server-side
// auto-calibrated draft builder (lib/actions/parts.ts), so both clamp part width to the same
// sane range regardless of which one computed it.
export const MIN_WIDTH_PERCENT = 5;
export const MAX_WIDTH_PERCENT = 60;
export const DEFAULT_WIDTH_PERCENT = 20;
