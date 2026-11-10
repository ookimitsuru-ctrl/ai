import type { MiddlewareHandler } from "hono";
import type { Env } from "./types";

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** 端末に保存する匿名トークン。形式: v1.<userId>.<署名>(個人情報は含めない) */
export async function signToken(userId: string, secret: string): Promise<string> {
  const payload = `v1.${userId}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

/** 正しければ userId、不正なら null */
export async function verifyToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) return null;
  let sig: Uint8Array;
  try {
    sig = fromB64url(parts[2]);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), sig, enc.encode(`v1.${parts[1]}`));
  return ok ? parts[1] : null;
}

/** 乱数のユーザーID(推測不能・英数字のみ) */
export function newUserId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return b64url(bytes);
}

/** 招待コード: 紛らわしい文字(0/O/1/I/L)を除いた8文字 */
export function newInviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, "");
}

/** 長さと内容が同じかを、時間差で漏らさず比較する */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const key = await hmacKey("compare-key", "sign");
  const [ha, hb] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(a)),
    crypto.subtle.sign("HMAC", key, enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

export type AppBindings = { Bindings: Env; Variables: { userId: string } };

/** Authorization: Bearer <token> を検証し、c.var.userId をセットする */
export const requireUser: MiddlewareHandler<AppBindings> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const userId = token ? await verifyToken(token, c.env.TOKEN_SECRET) : null;
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  // 削除済みユーザーのトークンは無効
  const row = await c.env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first();
  if (!row) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", userId);
  await next();
};
