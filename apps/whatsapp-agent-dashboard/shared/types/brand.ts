export type Brand<TValue, TName extends string> = TValue & {
  readonly __brand: TName;
};

export function asNonEmptyStringBrand<TName extends string>(
  value: string,
  label: string,
): Brand<string, TName> {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return normalized as Brand<string, TName>;
}
