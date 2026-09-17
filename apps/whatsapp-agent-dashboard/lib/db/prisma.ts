import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  whatsappAgentPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.whatsappAgentPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.whatsappAgentPrisma = prisma;
}
