import assert from "node:assert/strict";

import {
  renderMasterclassInstantMessage,
  renderMasterclassReminderMessage,
} from "../lib/automation/masterclass-registration-flow";

const config = {
  classTime: "08:00 PM",
  classDate: "07 August",
  classDay: "Friday",
  communityLink: "https://chat.whatsapp.com/DWeqmllf2x064XjeOP4yRd",
};

const expectedInstant = `Hi Learner 👋

Aapka registration *Free AI Expert Masterclass* ke liye *successfully receive ho gaya hai.* 🚀

🔴 *Live Class | 08:00 PM*
🗓 *07 August | Friday*

📌 *Masterclass ki joining link aur complete details* aapko hamari *WhatsApp Community* mein share ki jayengi.

👉 Updates miss na karne aur apni seat confirm karne ke liye abhi *WhatsApp Community join karein:*

🟢 https://chat.whatsapp.com/DWeqmllf2x064XjeOP4yRd

⚠️ *Seats limited hain — abhi community join karein.* ⏳

*Thank You for Registering!*
*Team SikhaDenge* 🎓`;

const expectedReminder = `Hi Learner 👋

⏰ Just a Quick Reminder

*AI Expert Masterclass* ki joining link aur final class instructions hamari *WhatsApp Community* mein hi share ki jayengi.

🔴 *Live Class | 08:00 PM*
🗓 *07 August | Friday*

👉 Agar aapne abhi tak WhatsApp Community join nahi ki hai, to neeche diye gaye link se abhi join karein:

🟢 https://chat.whatsapp.com/DWeqmllf2x064XjeOP4yRd

✅ Community pehle hi join kar chuke hain?
Perfect! Aapko kuch aur karne ki zarurat nahi hai. Class ki details community mein mil jayengi.

⚠️ Class start hone se pehle WhatsApp Community check karna na bhoolein.

*See You in the 🔴Live Masterclass!*
*Team SikhaDenge* 🎓`;

assert.equal(renderMasterclassInstantMessage(config), expectedInstant);
assert.equal(renderMasterclassReminderMessage(config), expectedReminder);

const firstEnrollmentSnapshot = { ...config };
const nextMasterclass = {
  ...config,
  classDate: "10 August",
  classDay: "Monday",
  communityLink: "https://chat.whatsapp.com/NEWCOMMUNITYLINK123",
};

assert.equal(
  renderMasterclassReminderMessage(firstEnrollmentSnapshot),
  expectedReminder,
  "A pending enrollment must keep its original date, day and community link.",
);
assert.match(
  renderMasterclassInstantMessage(nextMasterclass),
  /10 August \| Monday/u,
);
assert.match(
  renderMasterclassInstantMessage(nextMasterclass),
  /NEWCOMMUNITYLINK123/u,
);
assert.doesNotMatch(
  renderMasterclassReminderMessage(firstEnrollmentSnapshot),
  /NEWCOMMUNITYLINK123/u,
);

console.log("Masterclass two-step message tests passed.");
