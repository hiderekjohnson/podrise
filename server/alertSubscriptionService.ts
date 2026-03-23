import { pool } from "./db";
import { getUncachableResendClient } from "./resendClient";

const DEFAULT_ALERT_TYPES = [
  {
    alertType: "new_episode_queued",
    name: "New Episode Queued",
    description: "Sent every time a new episode from Taddy is added to the transcript pipeline queue.",
    enabled: true,
    emails: ["derek@podrise.com"],
  },
  {
    alertType: "recap_generated",
    name: "Recap Generated",
    description: "Sent every time an AI recap is successfully generated and published.",
    enabled: false,
    emails: ["derek@podrise.com"],
  },
  {
    alertType: "transcript_error",
    name: "Transcript Fetch Error",
    description: "Sent when a transcript fetch fails after all retry attempts.",
    enabled: false,
    emails: ["derek@podrise.com"],
  },
];

export async function ensureAlertSubscriptionsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_subscriptions (
        id SERIAL PRIMARY KEY,
        alert_type TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        emails TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    for (const def of DEFAULT_ALERT_TYPES) {
      await pool.query(
        `INSERT INTO alert_subscriptions (alert_type, name, description, enabled, emails)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (alert_type) DO NOTHING`,
        [def.alertType, def.name, def.description, def.enabled, def.emails]
      );
    }
    console.log("[AlertSubscriptions] Table ready");
  } catch (err: any) {
    console.error("[AlertSubscriptions] Setup error:", err?.message);
  }
}

export async function getAlertSubscriptions(): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, alert_type AS "alertType", name, description, enabled, emails, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM alert_subscriptions ORDER BY id ASC`
  );
  return rows;
}

export async function updateAlertSubscription(
  id: number,
  updates: { enabled?: boolean; emails?: string[]; name?: string; description?: string }
): Promise<any> {
  const setClauses: string[] = ["updated_at = NOW()"];
  const values: any[] = [];
  let idx = 1;

  if (typeof updates.enabled === "boolean") {
    setClauses.push(`enabled = $${idx++}`);
    values.push(updates.enabled);
  }
  if (Array.isArray(updates.emails)) {
    setClauses.push(`emails = $${idx++}`);
    values.push(updates.emails);
  }
  if (typeof updates.name === "string") {
    setClauses.push(`name = $${idx++}`);
    values.push(updates.name.trim());
  }
  if (typeof updates.description === "string") {
    setClauses.push(`description = $${idx++}`);
    values.push(updates.description.trim());
  }

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE alert_subscriptions SET ${setClauses.join(", ")}
     WHERE id = $${idx}
     RETURNING id, alert_type AS "alertType", name, description, enabled, emails, updated_at AS "updatedAt"`,
    values
  );
  return rows[0];
}

function formatAirDate(datePublished: number | null | undefined): string {
  if (!datePublished) return "Unknown";
  try {
    const date = new Date(datePublished * 1000);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    });
  } catch {
    return "Unknown";
  }
}

function formatSubjectDate(datePublished: number | null | undefined): string {
  if (!datePublished) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  try {
    const date = new Date(datePublished * 1000);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  } catch {
    return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
}

export async function sendNewEpisodeQueuedAlert(params: {
  podcastName: string;
  episodeTitle: string;
  datePublished: number | null;
  episodeGuid: string;
}): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT enabled, emails FROM alert_subscriptions WHERE alert_type = 'new_episode_queued' LIMIT 1`
    );
    const sub = rows[0];
    if (!sub || !sub.enabled || !sub.emails?.length) return;

    const airDate = formatAirDate(params.datePublished);
    const subjectDate = formatSubjectDate(params.datePublished);

    const pipelineUrl = "https://podrise.com/admin/internal-tools/pipeline";

    const subject = `[${subjectDate}] New Episode Queued — ${params.podcastName}`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">

        <!-- Header -->
        <tr>
          <td style="background:#6366f1;padding:20px 28px;">
            <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.75);">PodRise Pipeline Alert</p>
            <p style="margin:6px 0 0;font-size:20px;font-weight:800;color:#ffffff;line-height:1.3;">New Episode Queued</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e4e4e7;">
                  <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#71717a;">Podcast</p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:#18181b;">${escapeHtml(params.podcastName)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e4e4e7;">
                  <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#71717a;">Episode</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#18181b;line-height:1.4;">${escapeHtml(params.episodeTitle)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e4e4e7;">
                  <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#71717a;">Air Date</p>
                  <p style="margin:0;font-size:14px;color:#3f3f46;">${airDate}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#71717a;">Episode GUID</p>
                  <p style="margin:0;font-size:12px;font-family:monospace;color:#71717a;word-break:break-all;">${escapeHtml(params.episodeGuid)}</p>
                </td>
              </tr>
            </table>

            <div style="margin-top:24px;text-align:center;">
              <a href="${pipelineUrl}"
                 style="display:inline-block;padding:12px 28px;background:#6366f1;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px;letter-spacing:0.02em;">
                View Pipeline Dashboard →
              </a>
            </div>

            <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;text-align:center;">
              This episode has been added to the transcript fetch queue.<br>
              Transcript will be fetched, then recap generated automatically.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e4e4e7;">
            <p style="margin:0;font-size:11px;color:#a1a1aa;text-align:center;">
              PodRise Pipeline Notifications · <a href="${pipelineUrl}/admin/advanced" style="color:#a1a1aa;">Manage alerts</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const { client, fromEmail } = await getUncachableResendClient();
    await client.emails.send({
      from: `PodRise Pipeline <${fromEmail}>`,
      to: sub.emails,
      subject,
      html,
    });

    console.log(`[AlertSubscriptions] new_episode_queued alert sent for "${params.podcastName}" → ${sub.emails.join(", ")}`);
  } catch (err: any) {
    console.warn("[AlertSubscriptions] Failed to send new_episode_queued alert:", err?.message);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
