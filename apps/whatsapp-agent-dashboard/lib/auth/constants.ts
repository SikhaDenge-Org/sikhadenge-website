export const SESSION_COOKIE_NAME = "sd_wa_session";
export const DEFAULT_SESSION_DAYS = 7;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_MINUTES = 15;

export function getSessionDurationMs(): number {
  const configuredDays = Number(process.env.DASHBOARD_SESSION_DAYS ?? DEFAULT_SESSION_DAYS);
  const safeDays = Number.isFinite(configuredDays) && configuredDays > 0 ? configuredDays : DEFAULT_SESSION_DAYS;
  return safeDays * 24 * 60 * 60 * 1000;
}
