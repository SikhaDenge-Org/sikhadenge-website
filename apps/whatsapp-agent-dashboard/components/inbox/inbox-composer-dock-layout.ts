export const INBOX_COMPOSER_COMPACT_BREAKPOINT = 720;
export const INBOX_COMPOSER_DOCK_Z_INDEX = 1100;

export type InboxComposerDockLayout = {
  compact: boolean;
  rowTemplate: string;
};

export function getInboxComposerDockLayout(
  visibleWidth: number,
): InboxComposerDockLayout {
  const compact = visibleWidth < INBOX_COMPOSER_COMPACT_BREAKPOINT;

  return {
    compact,
    rowTemplate: compact
      ? "auto minmax(0, 1fr) auto"
      : "auto minmax(0, 1fr) auto auto auto",
  };
}
