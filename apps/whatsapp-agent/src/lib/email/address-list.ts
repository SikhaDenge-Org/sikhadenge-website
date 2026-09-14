import { normalizeEmailAddress } from "./validation";

export function normalizeEmailAddressList(values: string[]): string[] {
  return [...new Set(values.map(normalizeEmailAddress))];
}
