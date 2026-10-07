export type AdminPasswordResetValidation =
  | { ok: true }
  | { ok: false; error: string };

export function validateAdminPasswordReset(
  password: string,
  confirmation: string,
): AdminPasswordResetValidation {
  if (password.length < 12) {
    return { ok: false, error: "Password must contain at least 12 characters." };
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      ok: false,
      error: "Password must include uppercase, lowercase and numeric characters.",
    };
  }

  if (password !== confirmation) {
    return { ok: false, error: "Password confirmation does not match." };
  }

  return { ok: true };
}
