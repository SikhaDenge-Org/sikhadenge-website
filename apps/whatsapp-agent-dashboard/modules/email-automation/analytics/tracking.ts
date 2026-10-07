import { createHmac, timingSafeEqual } from "node:crypto";

function secret(env: NodeJS.ProcessEnv = process.env): string { const value = env.EMAIL_TRACKING_SECRET?.trim() || ""; if (value.length < 32) throw new Error("EMAIL_TRACKING_SECRET must be at least 32 characters when tracking is enabled."); return value; }
function sign(value: string, key = secret()): string { return createHmac("sha256", key).update(value).digest("base64url"); }
export function verifyTrackingSignature(value: string, signature: string): boolean { const expected = Buffer.from(sign(value)); const actual = Buffer.from(signature); return actual.length === expected.length && timingSafeEqual(actual, expected); }
export function openTrackingSignature(messageId: string): string { return sign(`open:${messageId}`); }
export function clickTrackingSignature(messageId: string, url: string): string { return sign(`click:${messageId}:${url}`); }
export function instrumentEmailHtml(input: { messageId: string; html: string; appUrl: string }): string {
  const base = new URL(input.appUrl); if (process.env.NODE_ENV === "production" && base.protocol !== "https:") throw new Error("Email tracking requires HTTPS in production.");
  let html = input.html.replace(/href=(['"])(https?:\/\/[^'"#]+[^'"]*)\1/giu, (_m, q: string, url: string) => { if (url.includes("/api/email/track/")) return _m; const target = new URL("/api/email/track/click", base); target.searchParams.set("m", input.messageId); target.searchParams.set("u", Buffer.from(url).toString("base64url")); target.searchParams.set("s", clickTrackingSignature(input.messageId, url)); return `href=${q}${target.toString()}${q}`; });
  const pixel = new URL(`/api/email/track/open/${encodeURIComponent(input.messageId)}`, base); pixel.searchParams.set("s", openTrackingSignature(input.messageId));
  html += `<img src="${pixel.toString()}" width="1" height="1" alt="" style="display:none!important;width:1px;height:1px;border:0" />`;
  return html;
}