import assert from "node:assert/strict";

import { verifyMetaProviderReadOnly } from "../lib/integrations/read-only-verifier";

async function main() {
  let requestedMethod = "";
  let requestedAuthorization = "";
  const verified = await verifyMetaProviderReadOnly("META_WHATSAPP", {
    env: {
      WHATSAPP_ACCESS_TOKEN: "server-secret-token",
      WHATSAPP_PHONE_NUMBER_ID: "12345",
      WHATSAPP_GRAPH_VERSION: "v23.0",
    },
    fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestedMethod = init?.method || "";
      requestedAuthorization = new Headers(init?.headers).get("Authorization") || "";
      return new Response(JSON.stringify({ id: "12345" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
    now: () => new Date("2026-09-09T14:00:00Z"),
  });

  assert.equal(verified.verified, true);
  assert.equal(verified.externalWriteSent, false);
  assert.equal(requestedMethod, "GET");
  assert.equal(requestedAuthorization, "Bearer server-secret-token");
  assert.equal(JSON.stringify(verified).includes("server-secret-token"), false);

  const mismatch = await verifyMetaProviderReadOnly("META_WHATSAPP", {
    env: {
      WHATSAPP_ACCESS_TOKEN: "server-secret-token",
      WHATSAPP_PHONE_NUMBER_ID: "12345",
      WHATSAPP_GRAPH_VERSION: "v23.0",
    },
    fetchImpl: (async () =>
      new Response(JSON.stringify({ id: "different" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
  });
  assert.equal(mismatch.verified, false);

  const missing = await verifyMetaProviderReadOnly("META_INSTAGRAM", {
    env: {},
  });
  assert.equal(missing.verified, false);
  assert.match(missing.reason, /INSTAGRAM_ACCESS_TOKEN/);

  await assert.rejects(
    verifyMetaProviderReadOnly("UNSUPPORTED", { env: {} }),
    /does not support read-only verification/,
  );

  console.log("Integration read-only verifier tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
