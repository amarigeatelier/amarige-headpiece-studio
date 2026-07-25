import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

export const DAILY_GENERATION_LIMIT = 10;
export const CREDIT_PACK_SIZE = 10;
export const CREDIT_PACK_PRICE_JPY = 300;

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function hashIp(ip: string): string {
  const salt = process.env.ADMIN_SESSION_SECRET ?? "amarige";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "2026-07-16"
}

/** Read-only check — does NOT consume quota. Accounts for any purchased bonusLimit. */
export async function isUnderDailyLimit(ip: string): Promise<boolean> {
  const attempt = await db.generationAttempt.findUnique({
    where: { ipHash_day: { ipHash: hashIp(ip), day: todayKey() } },
  });
  const limit = DAILY_GENERATION_LIMIT + (attempt?.bonusLimit ?? 0);
  return (attempt?.count ?? 0) < limit;
}

/** Call only when an actual Gemini generation is about to happen (cache miss). */
export async function recordGenerationAttempt(ip: string): Promise<void> {
  const ipHash = hashIp(ip);
  const day = todayKey();
  await db.generationAttempt.upsert({
    where: { ipHash_day: { ipHash, day } },
    create: { ipHash, day, count: 1 },
    update: { count: { increment: 1 } },
  });
}

/** Grants a purchased credit pack to the given ip's daily quota (idempotent — see GenerationCreditPurchase). */
export async function grantBonusCredits(ipHash: string, day: string, credits: number): Promise<void> {
  await db.generationAttempt.upsert({
    where: { ipHash_day: { ipHash, day } },
    create: { ipHash, day, count: 0, bonusLimit: credits },
    update: { bonusLimit: { increment: credits } },
  });
}
