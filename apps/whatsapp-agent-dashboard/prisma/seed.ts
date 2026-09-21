import { DashboardRole, PrismaClient } from "@prisma/client";

import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const name = process.env.DASHBOARD_ADMIN_NAME?.trim();
  const email = process.env.DASHBOARD_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DASHBOARD_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error(
      "DASHBOARD_ADMIN_NAME, DASHBOARD_ADMIN_EMAIL and DASHBOARD_ADMIN_PASSWORD are required.",
    );
  }

  if (password === "CHANGE_THIS_BEFORE_SEEDING") {
    throw new Error("Replace the example admin password before running the seed.");
  }

  const passwordHash = await hashPassword(password);

  await prisma.dashboardUser.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: DashboardRole.ADMIN,
      isActive: true,
    },
    create: {
      name,
      email,
      passwordHash,
      role: DashboardRole.ADMIN,
    },
  });

  console.log(`Dashboard admin is ready: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
