import { runSalesOSVerification } from "../lib/sales-os/sa10-cutover-verifier";

async function main() {
  console.log("\n==========================================");
  console.log("🚀 SIKHADENGE SALES OS SA10 AUDIT RUNNER");
  console.log("==========================================");

  const res = await runSalesOSVerification();
  res.checks.forEach(c => {
    const icon = c.passed ? "✅ [PASS]" : "❌ [FAIL]";
    console.log(`${icon} [${c.phase}] ${c.name} -> ${c.message}`);
  });

  console.log("------------------------------------------");
  console.log(`Total Checks: ${res.totalChecks} | Status: ${res.allPassed ? "100% CERTIFIED" : "VERIFICATION FAILED"}`);
  console.log("==========================================\n");

  if (!res.allPassed) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Verification execution error:", err);
  process.exit(1);
});
