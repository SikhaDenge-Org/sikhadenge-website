import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/whatsapp-phase21f-nosend-runtime-qualification.ts", "utf8");

assert.match(source, /Phase21E No-Send Canary/);
assert.match(source, /INCOMING_KEYWORD/);
assert.match(source, /nodes\[1\]\?\.type !== "END"/);
assert.match(source, /WHATSAPP_OUTBOUND_MODE !== "disabled"/);
assert.match(source, /WHATSAPP_OUTBOUND_KILL_SWITCH !== "on"/);
assert.match(source, /WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED !== "false"/);
assert.match(source, /queuedMessageIds\.length !== 0/);
assert.match(source, /externalWhatsAppWriteSent: false/);

console.log("Phase21F WhatsApp no-send runtime qualification certification: PASS");
