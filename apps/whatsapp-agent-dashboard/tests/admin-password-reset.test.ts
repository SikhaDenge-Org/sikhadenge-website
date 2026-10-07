import assert from "node:assert/strict";

import { validateAdminPasswordReset } from "../components/admin/admin-password-reset";

assert.deepEqual(validateAdminPasswordReset("Short1A", "Short1A"), {
  ok: false,
  error: "Password must contain at least 12 characters.",
});

assert.deepEqual(validateAdminPasswordReset("alllowercase123", "alllowercase123"), {
  ok: false,
  error: "Password must include uppercase, lowercase and numeric characters.",
});

assert.deepEqual(validateAdminPasswordReset("StrongPassword123", "StrongPassword124"), {
  ok: false,
  error: "Password confirmation does not match.",
});

assert.deepEqual(validateAdminPasswordReset("StrongPassword123", "StrongPassword123"), {
  ok: true,
});

console.log("admin password reset tests passed");
