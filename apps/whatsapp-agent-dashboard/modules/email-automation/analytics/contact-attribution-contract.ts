export function selectUniqueWorkspaceContactId(
  values: readonly (string | null | undefined)[],
): string | null {
  const ids = [...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean))];
  return ids.length === 1 ? ids[0] : null;
}
