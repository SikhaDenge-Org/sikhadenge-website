module.exports = {
  apps: [
    {
      name: "sikhadenge-engageos-event-worker",
      cwd: __dirname,
      script: "/usr/bin/node",
      args: "node_modules/tsx/dist/cli.mjs scripts/engageos-event-worker.ts",
      interpreter: "none",
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        NODE_ENV: "production",
        ENGAGEOS_EVENT_RUNTIME_ENABLED: "false",
        ENGAGEOS_EVENT_WORKER_ENABLED: "false",
        WHATSAPP_OUTBOUND_MODE: "disabled",
        AGENT_AUTO_REPLY_ENABLED: "false",
        AGENT_IMMEDIATE_DISPATCH_ENABLED: "false",
        AUTOMATION_ACTIONS_ENABLED: "false",
      },
    },
  ],
};
