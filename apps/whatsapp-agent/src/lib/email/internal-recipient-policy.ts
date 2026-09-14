function splitList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedInternalEmailRecipient(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const allowedAddresses = splitList(process.env.EMAIL_INTERNAL_RECIPIENTS);
  const allowedDomains = splitList(process.env.EMAIL_INTERNAL_DOMAINS).map((domain) => domain.replace(/^@/, ""));
  if (allowedAddresses.includes(normalized)) return true;
  const domain = normalized.split("@")[1] || "";
  return Boolean(domain && allowedDomains.includes(domain));
}
