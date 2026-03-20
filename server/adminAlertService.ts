import { getUncachableResendClient } from "./resendClient";

const ADMIN_ALERT_EMAIL = "derek@podrise.com";
const COOLDOWN_MS = 60 * 60 * 1000;
const cooldownMap = new Map<string, number>();

type AlertSeverity = "critical" | "warning";

interface AlertOptions {
  apiName: string;
  errorType: string;
  errorMessage: string;
  severity?: AlertSeverity;
  adminPath?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getCooldownKey(apiName: string, errorType: string): string {
  return `${apiName}::${errorType}`;
}

function isCoolingDown(key: string): boolean {
  const lastSent = cooldownMap.get(key);
  if (!lastSent) return false;
  if (Date.now() - lastSent < COOLDOWN_MS) return true;
  cooldownMap.delete(key);
  return false;
}

async function logAlertToDb(options: AlertOptions & { severity: AlertSeverity }): Promise<void> {
  try {
    const { pool } = await import("./db");
    await pool.query(
      `INSERT INTO admin_alerts (api_name, error_type, error_message, severity, recipient_email)
       VALUES ($1, $2, $3, $4, $5)`,
      [options.apiName, options.errorType, options.errorMessage.substring(0, 2000), options.severity, ADMIN_ALERT_EMAIL]
    );
  } catch {
    console.warn("[AdminAlert] Failed to log alert to DB");
  }
}

export async function sendCriticalApiAlert(options: AlertOptions): Promise<void> {
  const { apiName, errorType, errorMessage, severity = "critical", adminPath = "/admin" } = options;
  const key = getCooldownKey(apiName, errorType);

  if (isCoolingDown(key)) {
    console.log(`[AdminAlert] Suppressed duplicate alert for ${apiName}/${errorType} (cooldown active)`);
    return;
  }

  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const safeApiName = escapeHtml(apiName);
  const safeErrorType = escapeHtml(errorType);
  const safeErrorMessage = escapeHtml(errorMessage.substring(0, 500));
  const severityColor = severity === "critical" ? "#DC2626" : "#F59E0B";
  const severityBg = severity === "critical" ? "#FEF2F2" : "#FEF3C7";
  const severityBorder = severity === "critical" ? "#FECACA" : "#FDE68A";
  const severityLabel = severity === "critical" ? "CRITICAL" : "WARNING";
  const adminUrl = `https://podrise.com${adminPath}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="background: ${severityColor}; color: white; padding: 12px 20px; border-radius: 8px 8px 0 0; font-size: 14px; font-weight: 700; letter-spacing: 0.5px;">
        🚨 ${severityLabel} API FAILURE
      </div>
      <div style="border: 1px solid ${severityBorder}; border-top: none; border-radius: 0 0 8px 8px; padding: 20px; background: ${severityBg};">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #1a1a1a;">
          <tr>
            <td style="padding: 8px 0; font-weight: 600; width: 100px; vertical-align: top;">API</td>
            <td style="padding: 8px 0;">${safeApiName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 600; vertical-align: top;">Error Type</td>
            <td style="padding: 8px 0;">${safeErrorType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 600; vertical-align: top;">Message</td>
            <td style="padding: 8px 0; word-break: break-word;">${safeErrorMessage}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 600; vertical-align: top;">Time</td>
            <td style="padding: 8px 0;">${timestamp}</td>
          </tr>
        </table>
      </div>
      <div style="margin-top: 20px; text-align: center;">
        <a href="${adminUrl}" style="display: inline-block; background: #2563EB; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">Open Admin Dashboard</a>
      </div>
      <p style="margin: 16px 0 0; font-size: 12px; color: #9CA3AF; text-align: center;">
        Duplicate alerts for this error type are suppressed for 1 hour.
      </p>
    </div>
  `;

  const resolvedSeverity = severity;

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    await client.emails.send({
      from: `PodRise Alerts <${fromEmail}>`,
      to: ADMIN_ALERT_EMAIL,
      subject: `🚨 ${severityLabel}: ${apiName} — ${errorType}`,
      html,
    });
    cooldownMap.set(key, Date.now());
    console.log(`[AdminAlert] Alert email sent for ${apiName}/${errorType}`);
  } catch (err) {
    console.error(`[AdminAlert] Failed to send alert email for ${apiName}/${errorType}:`, err);
  }

  logAlertToDb({ apiName, errorType, errorMessage, severity: resolvedSeverity, adminPath }).catch(() => {});
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

function getErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err && typeof (err as Record<string, unknown>).status === "number") {
    return (err as Record<string, unknown>).status as number;
  }
  if (err && typeof err === "object" && "statusCode" in err && typeof (err as Record<string, unknown>).statusCode === "number") {
    return (err as Record<string, unknown>).statusCode as number;
  }
  return undefined;
}

export function isCriticalOpenAIError(err: unknown): boolean {
  if (!err) return false;
  const msg = getErrorMessage(err);
  const status = getErrorStatus(err);
  if (status === 429 || status === 401 || status === 403) return true;
  if (/rate.?limit|quota|billing|exceeded|insufficient.?funds|authentication|unauthorized/i.test(msg)) return true;
  return false;
}

export function isCriticalResendError(err: unknown): boolean {
  if (!err) return false;
  const msg = getErrorMessage(err).toLowerCase();
  if (/rate.?limit|quota|billing|exceeded|auth|forbidden|api.?key/i.test(msg)) return true;
  const status = getErrorStatus(err);
  if (status === 429 || status === 401 || status === 403) return true;
  return false;
}

export function isCriticalTaddyError(statusCode: number, responseText: string): boolean {
  if (statusCode === 429 || statusCode === 401 || statusCode === 403) return true;
  if (/API_RATE_LIMIT_EXCEEDED|billing|plan|quota|auth|unauthorized|forbidden/i.test(responseText)) return true;
  return false;
}

export function classifyTaddyError(statusCode: number, responseText: string): string {
  if (statusCode === 429) return "Rate Limit (HTTP 429)";
  if (statusCode === 401) return "Authentication Failure";
  if (statusCode === 403) return "Access Forbidden";
  if (/API_RATE_LIMIT_EXCEEDED/i.test(responseText)) return "Rate Limit Exceeded";
  if (/billing|plan|quota/i.test(responseText)) return "Billing/Plan Issue";
  if (/auth|unauthorized/i.test(responseText)) return "Authentication Failure";
  return "Critical API Error";
}

export function classifyOpenAIError(err: unknown): string {
  const status = getErrorStatus(err);
  if (status === 429) return "Rate Limit Exceeded";
  if (status === 401) return "Authentication Failure";
  if (status === 403) return "Access Forbidden";
  const msg = getErrorMessage(err);
  if (/quota|billing|insufficient/i.test(msg)) return "Quota/Billing Issue";
  return "Critical API Error";
}

// TODO: Add Stripe error classification when a Stripe API client is introduced in the codebase.
// Currently no active Stripe API calls exist, so Stripe alerting is deferred.

export function classifyResendError(err: unknown): string {
  const msg = getErrorMessage(err).toLowerCase();
  if (/rate.?limit/i.test(msg)) return "Rate Limit Exceeded";
  if (/api.?key|auth/i.test(msg)) return "Authentication Failure";
  if (/billing|quota/i.test(msg)) return "Quota/Billing Issue";
  return "Critical API Error";
}
