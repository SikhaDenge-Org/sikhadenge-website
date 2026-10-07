const path = require("node:path");
const ROOT = __dirname;
module.exports = {
  apps: [
    {
      name: "sikhadenge-whatsapp-automation-scheduler",
      cwd: ROOT,
      script: path.join(ROOT, "node_modules/tsx/dist/cli.mjs"),
      args: "scripts/whatsapp-automation-scheduler.ts",
      interpreter: "/usr/bin/node",
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        NODE_ENV: "production",
        WHATSAPP_AUTOMATION_SCHEDULER_ENABLED: "true",
        WHATSAPP_AUTOMATION_SCHEDULER_INTERVAL_MS: "5000",
        AUTOMATION_RUNTIME_ENABLED: "false",
        AUTOMATION_ACTIONS_ENABLED: "false",
        WHATSAPP_AUTOMATION_EVENT_SOURCE_PREFIX: "",
        JOURNEY_RUNTIME_ENABLED: "false",
        JOURNEY_ACTIONS_ENABLED: "false",
        WHATSAPP_CAMPAIGNS_ENABLED: "false",
        WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED: "false",
        WHATSAPP_AUTOMATION_ALLOW_GLOBAL_QUEUED_DISPATCH: "false",
        WHATSAPP_OUTBOUND_MODE: "disabled",
        WHATSAPP_OUTBOUND_KILL_SWITCH: "on",
        INTEGRATION_EXTERNAL_WRITES_ENABLED: "false",
        AGENT_AUTO_REPLY_ENABLED: "false",
        AGENT_IMMEDIATE_DISPATCH_ENABLED: "false"
      }
    }
  ]
};
