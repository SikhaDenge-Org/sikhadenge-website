import { evaluatePendingWhatsAppAutomationEventsShadow } from "@/modules/automations/application/whatsapp-automation-shadow-evaluator";

async function main() {
  const result = await evaluatePendingWhatsAppAutomationEventsShadow({ limit: 20 });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Shadow audit failed."}\n`);
  process.exitCode = 1;
});
