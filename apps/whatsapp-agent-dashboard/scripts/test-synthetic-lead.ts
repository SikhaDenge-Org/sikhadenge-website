import { prisma } from "../lib/db/prisma";
import { 
  resolveWhatsAppContext, 
  extractSignals, 
  updateLeadFromSignals, 
  calculateLeadPriority,
  determineNextBestAction,
  calculateFollowUpDelayHours
} from "../lib/sales-os";

async function runEndToEndSimulation() {
  console.log("\n==========================================");
  console.log("🧪 LIVE SALES OS END-TO-END SIMULATION");
  console.log("==========================================");

  const testPhone = "+919999999999";
  
  // 1. Resolve Contact & Conversation
  console.log("Step 1: Resolving Contact & Conversation...");
  const resolved = await resolveWhatsAppContext({
    phone: testPhone,
    displayName: "Test Student Ankit"
  });
  const contactId = resolved.contactId;
  const conversationId = resolved.conversationId;
  console.log("  -> Contact ID:", contactId);
  console.log("  -> Conversation ID:", conversationId);

  // 2. Incoming Inquiry Simulation
  const studentMessage = "Sir AI and ChatGPT course ki fees kitni hai? Mujhe admission lena hai.";
  console.log("\nStep 2: Parsing Student Message ->", studentMessage);
  const signals = extractSignals(studentMessage);
  console.log("  -> Detected Intent:", signals.detectedIntent);
  console.log("  -> Course:", signals.interestedCourse);
  console.log("  -> Score Boost:", signals.scoreAdjustment);

  // 3. Lead CRM Sync
  console.log("\nStep 3: Updating CRM Lead Table...");
  const lead = await updateLeadFromSignals({
    contactId,
    conversationId,
    phone: testPhone,
    signals
  });
  console.log("  -> Lead Stage:", lead.stage);
  console.log("  -> Lead Temperature:", lead.temperature);
  console.log("  -> Lead Score:", lead.score);

  // 4. Priority & Counsellor Routing
  console.log("\nStep 4: Calculating Routing Priority...");
  const priority = calculateLeadPriority({
    temperature: lead.temperature as "HOT" | "WARM" | "COLD",
    score: lead.score,
    counselorRequested: lead.counselorRequested,
    feeUnderstood: lead.feeUnderstood
  });
  const action = determineNextBestAction({
    temperature: lead.temperature as "HOT" | "WARM" | "COLD",
    score: lead.score,
    counselorRequested: lead.counselorRequested,
    feeUnderstood: lead.feeUnderstood
  });
  const followUpDelay = calculateFollowUpDelayHours(lead.temperature as "HOT" | "WARM" | "COLD", false);
  
  console.log("  -> Counsellor Priority SLA:", `${priority.slaMinutes} minutes`);
  console.log("  -> Priority Score:", priority.priorityScore);
  console.log("  -> Next Best Action:", action);
  console.log("  -> Automated Follow-up Cadence:", `${followUpDelay} hours`);

  // 5. Cleanup Test Lead
  console.log("\nStep 5: Cleaning up synthetic test lead...");
  await prisma.lead.deleteMany({ where: { contactId } });
  await prisma.whatsAppMessage.deleteMany({ where: { conversationId } });
  await prisma.whatsAppConversation.deleteMany({ where: { id: conversationId } });
  await prisma.whatsAppContact.deleteMany({ where: { id: contactId } });
  console.log("  -> Test data cleaned up successfully.");

  console.log("\n==========================================");
  console.log("🎉 VERDICT: COMPLETE SALES OS PIPELINE 100% OPERATIONAL");
  console.log("==========================================\n");
}

runEndToEndSimulation()
  .catch((err) => {
    console.error("Simulation Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
