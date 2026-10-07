import assert from "node:assert/strict";

import {
  isSecurityPersistenceMasterEnabled,
} from "@/modules/auth/infrastructure/prisma-authorization";
import {
  channelFromConversationSource,
  parsePersistedCapabilities,
  resolveManualOutboundPurpose,
} from "@/modules/policy/infrastructure/prisma-outbound-policy";
import {
  deriveWebhookExternalEventId,
} from "@/modules/channels/core/security/prisma-webhook-replay";
import {
  hasPermission,
  type WorkspaceMembership,
} from "@/modules/auth/domain/permissions";
import {
  workspaceActorId,
  workspaceId,
} from "@/modules/workspaces/domain/workspace";

assert.equal(isSecurityPersistenceMasterEnabled({}), false);
assert.equal(
  isSecurityPersistenceMasterEnabled({
    ENGAGEOS_SECURITY_PERSISTENCE_ENABLED: " true ",
  }),
  true,
);
assert.equal(
  isSecurityPersistenceMasterEnabled({
    ENGAGEOS_SECURITY_PERSISTENCE_ENABLED: "false",
  }),
  false,
);

const viewerWithGrant: WorkspaceMembership = {
  workspaceId: workspaceId("workspace-a"),
  userId: workspaceActorId("user-a"),
  role: "VIEWER",
  isActive: true,
  grantedPermissions: ["inbox.reply"],
};
assert.equal(hasPermission(viewerWithGrant, "inbox.reply"), true);
assert.equal(hasPermission(viewerWithGrant, "security.manage"), false);

assert.equal(channelFromConversationSource(null), "WHATSAPP");
assert.equal(channelFromConversationSource(" Instagram "), "INSTAGRAM");
assert.equal(channelFromConversationSource("messenger"), "MESSENGER");
assert.throws(() => channelFromConversationSource("unsupported"));

assert.equal(resolveManualOutboundPurpose({ kind: "text" }), "SERVICE");
assert.equal(resolveManualOutboundPurpose({ kind: "media" }), "SERVICE");
assert.equal(
  resolveManualOutboundPurpose({
    kind: "template",
    templateCategory: "MARKETING",
  }),
  "MARKETING",
);
assert.equal(
  resolveManualOutboundPurpose({
    kind: "template",
    templateCategory: "UTILITY",
  }),
  "TRANSACTIONAL",
);

const capabilities = parsePersistedCapabilities({
  OUTBOUND_TEXT: true,
  OUTBOUND_MEDIA: false,
  WEBHOOK_VERIFY: "not-a-boolean",
});
assert.equal(capabilities.OUTBOUND_TEXT, true);
assert.equal(capabilities.OUTBOUND_MEDIA, false);
assert.equal(capabilities.WEBHOOK_VERIFY, false);
assert.equal(Object.isFrozen(capabilities), true);

const firstEventId = deriveWebhookExternalEventId('{"event":1}');
const repeatedEventId = deriveWebhookExternalEventId('{"event":1}');
const otherEventId = deriveWebhookExternalEventId('{"event":2}');
assert.equal(firstEventId, repeatedEventId);
assert.notEqual(firstEventId, otherEventId);
assert.match(firstEventId, /^payload-sha256:[a-f0-9]{64}$/);

console.log("EngageOS security persistence unit tests passed: 20 assertions.");
