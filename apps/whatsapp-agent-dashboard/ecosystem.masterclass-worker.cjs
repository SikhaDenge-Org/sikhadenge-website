const path = require("node:path");

const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: "sikhadenge-masterclass-flow-worker",
      cwd: ROOT,
      script: path.join(ROOT, "node_modules/tsx/dist/cli.mjs"),
      args: "scripts/masterclass-flow-worker.ts",
      interpreter: "/usr/bin/node",
      autorestart: true,
      env: {
        // Repository-owned PM2 definition is intentionally fail-closed.
        // Live outbound activation must be supplied explicitly by the
        // controlled production activation procedure, never by Git checkout.
        AUTOMATION_ACTIONS_ENABLED: "false",
        AUTOMATION_RUNTIME_ENABLED: "false",
        WHATSAPP_OUTBOUND_MODE: "disabled",
        WHATSAPP_CUTOVER_APPROVED: "false",
        WHATSAPP_OUTBOUND_LIVE_ACK: "REPO_DEFAULT_PAUSED",
        WHATSAPP_OUTBOUND_KILL_SWITCH: "on",
        INTEGRATION_EXTERNAL_WRITES_ENABLED: "false",
        WHATSAPP_CAMPAIGNS_ENABLED: "false",
        AGENT_AUTO_REPLY_ENABLED: "false",
        AGENT_IMMEDIATE_DISPATCH_ENABLED: "false",
      },
    },
  ],
};
