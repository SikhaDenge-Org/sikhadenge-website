import { applyEmailMarketingUnsubscribe } from "@/modules/email-automation/campaigns/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head><body style="font-family:Arial,sans-serif;max-width:640px;margin:60px auto;padding:24px"><h1>${title}</h1><p>${body}</p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

function tokenFrom(request: Request): string {
  return new URL(request.url).searchParams.get("t")?.trim() || "";
}

export async function GET(request: Request) {
  try {
    const token = tokenFrom(request);
    if (!token) return page("Invalid unsubscribe link", "The unsubscribe token is missing.", 400);
    await applyEmailMarketingUnsubscribe(token);
    return page("Email preferences updated", "You have been unsubscribed from marketing emails for this workspace.");
  } catch (error) {
    return page("Unsubscribe failed", error instanceof Error ? error.message : "The unsubscribe request could not be completed.", 400);
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return new Response(null, { status: 415, headers: { "cache-control": "no-store" } });
  }

  const token = tokenFrom(request);
  if (!token) return new Response(null, { status: 400, headers: { "cache-control": "no-store" } });

  let body: URLSearchParams;
  try { body = new URLSearchParams(await request.text()); }
  catch { return new Response(null, { status: 400, headers: { "cache-control": "no-store" } }); }

  if (body.get("List-Unsubscribe") !== "One-Click") {
    return new Response(null, { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    await applyEmailMarketingUnsubscribe(token);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch {
    return new Response(null, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
