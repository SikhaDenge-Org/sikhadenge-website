import { EmailTemplateService } from "../application/template-service";
import { PrismaEmailSenderRepository } from "./prisma-email-sender-repository";
import { PrismaEmailTemplateRepository } from "./prisma-email-template-repository";

export function buildEmailTemplateRuntime() {
  const templates = new PrismaEmailTemplateRepository();
  const senders = new PrismaEmailSenderRepository();
  return {
    templates,
    senders,
    service: new EmailTemplateService(templates, senders),
  };
}
