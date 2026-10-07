import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  validatePasswordStrength(password);
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function validatePasswordStrength(password: string): void {
  if (password.length < 12) {
    throw new Error("Password must contain at least 12 characters.");
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Password must include uppercase, lowercase and numeric characters.");
  }
}
