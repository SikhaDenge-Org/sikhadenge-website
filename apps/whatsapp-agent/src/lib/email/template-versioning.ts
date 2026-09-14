export function nextEmailTemplateVersion(currentVersion: number): number {
  if (!Number.isInteger(currentVersion) || currentVersion < 1) {
    throw new Error("Email template version must be a positive integer.");
  }
  return currentVersion + 1;
}

export function shouldVersionEmailTemplateChange(input: {
  subjectChanged: boolean;
  preheaderChanged: boolean;
  htmlChanged: boolean;
  textChanged: boolean;
  senderChanged: boolean;
  assetsChanged: boolean;
}): boolean {
  return Object.values(input).some(Boolean);
}
