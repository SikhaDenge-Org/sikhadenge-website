import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_WORKSPACE_ID = "engagews_default";
const DEFAULT_WORKSPACE_SLUG = "sikhadenge-default";

const FEATURE_FLAGS = [
  {
    id: "engageflag_route_permissions",
    key: "engageos.route_permissions",
  },
  {
    id: "engageflag_outbound_policy",
    key: "engageos.outbound_policy",
  },
  {
    id: "engageflag_webhook_replay",
    key: "engageos.webhook_replay",
  },
] as const;

function membershipId(userId: string): string {
  return `engagem_${createHash("md5").update(userId).digest("hex")}`;
}

async function main() {
  await prisma.engageWorkspace.upsert({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    create: {
      id: DEFAULT_WORKSPACE_ID,
      slug: DEFAULT_WORKSPACE_SLUG,
      name: "SikhaDenge",
      timezone: "Asia/Kolkata",
      isActive: true,
    },
    update: {},
  });

  const users = await prisma.dashboardUser.findMany({
    select: {
      id: true,
      role: true,
      isActive: true,
    },
  });

  for (const user of users) {
    await prisma.engageWorkspaceMembership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          userId: user.id,
        },
      },
      create: {
        id: membershipId(user.id),
        workspaceId: DEFAULT_WORKSPACE_ID,
        userId: user.id,
        role: user.role,
        isActive: user.isActive,
      },
      update: {
        role: user.role,
        isActive: user.isActive,
      },
    });
  }

  for (const flag of FEATURE_FLAGS) {
    await prisma.engageFeatureFlag.upsert({
      where: {
        workspaceId_key: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          key: flag.key,
        },
      },
      create: {
        id: flag.id,
        workspaceId: DEFAULT_WORKSPACE_ID,
        key: flag.key,
        enabled: false,
      },
      update: {},
    });
  }

  console.log(
    `Materialized EngageOS CI base state for ${users.length} dashboard user(s).`,
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
