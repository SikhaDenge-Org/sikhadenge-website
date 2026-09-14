import type { EmailTemplateVariable } from "./contracts";

export const EMAIL_TEMPLATE_BLOCK_TYPES = [
  "HEADING",
  "TEXT",
  "IMAGE",
  "BUTTON",
  "DIVIDER",
  "SPACER",
] as const;

export type EmailTemplateBlockType = (typeof EMAIL_TEMPLATE_BLOCK_TYPES)[number];
export type EmailTextAlign = "LEFT" | "CENTER" | "RIGHT";

type EmailTemplateBlockBase = {
  id: string;
  type: EmailTemplateBlockType;
};

export type EmailHeadingBlock = EmailTemplateBlockBase & {
  type: "HEADING";
  text: string;
  level: 1 | 2 | 3;
  align?: EmailTextAlign;
};

export type EmailTextBlock = EmailTemplateBlockBase & {
  type: "TEXT";
  text: string;
  align?: EmailTextAlign;
};

export type EmailImageBlock = EmailTemplateBlockBase & {
  type: "IMAGE";
  src: string;
  alt: string;
  width?: number;
  linkUrl?: string;
  assetId?: string;
};

export type EmailButtonBlock = EmailTemplateBlockBase & {
  type: "BUTTON";
  label: string;
  url: string;
  align?: EmailTextAlign;
};

export type EmailDividerBlock = EmailTemplateBlockBase & {
  type: "DIVIDER";
  color?: string;
  thickness?: number;
};

export type EmailSpacerBlock = EmailTemplateBlockBase & {
  type: "SPACER";
  height: number;
};

export type EmailTemplateBlock =
  | EmailHeadingBlock
  | EmailTextBlock
  | EmailImageBlock
  | EmailButtonBlock
  | EmailDividerBlock
  | EmailSpacerBlock;

export type EmailTemplateDocument = {
  subject: string;
  preheader: string | null;
  blocks: readonly EmailTemplateBlock[];
  variables: readonly EmailTemplateVariable[];
};

export type EmailTemplatePreviewMode = "DESKTOP" | "MOBILE";
