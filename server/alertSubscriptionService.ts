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

interface PipelineStats {
  queuedAt: Date;
  queuePending: number;
  queueInProgress: number;
  queueFailed: number;
  queuePosition: number | null;
  lastTranscriptAt: Date | null;
  lastRecapAt: Date | null;
  transcriptsLast24h: number;
  recapsLast24h: number;
}

async function fetchPipelineStats(episodeGuid: string): Promise<PipelineStats> {
  const now = new Date();

  const [queueStats, positionResult, lastTranscript, lastRecap, stats24h] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed
      FROM pending_transcript_queue
    `),
    pool.query(`
      SELECT COUNT(*) AS position
      FROM pending_transcript_queue
      WHERE status = 'pending'
        AND created_at <= COALESCE(
          (SELECT created_at FROM pending_transcript_queue WHERE episode_guid = $1 ORDER BY created_at DESC LIMIT 1),
          NOW()
        )
    `, [episodeGuid]),
    pool.query(`SELECT created_at FROM episode_transcripts ORDER BY created_at DESC LIMIT 1`),
    pool.query(`SELECT created_at FROM landing_page_recaps ORDER BY created_at DESC LIMIT 1`),
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM episode_transcripts WHERE created_at >= NOW() - INTERVAL '24 hours') AS transcripts,
        (SELECT COUNT(*) FROM landing_page_recaps WHERE created_at >= NOW() - INTERVAL '24 hours') AS recaps
    `),
  ]);

  return {
    queuedAt: now,
    queuePending: parseInt(queueStats.rows[0]?.pending ?? "0"),
    queueInProgress: parseInt(queueStats.rows[0]?.in_progress ?? "0"),
    queueFailed: parseInt(queueStats.rows[0]?.failed ?? "0"),
    queuePosition: positionResult.rows[0] ? parseInt(positionResult.rows[0].position) : null,
    lastTranscriptAt: lastTranscript.rows[0]?.created_at ?? null,
    lastRecapAt: lastRecap.rows[0]?.created_at ?? null,
    transcriptsLast24h: parseInt(stats24h.rows[0]?.transcripts ?? "0"),
    recapsLast24h: parseInt(stats24h.rows[0]?.recaps ?? "0"),
  };
}

function timeAgoShort(date: Date | null): string {
  if (!date) return "Never";
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function healthColor(date: Date | null, warnMins: number, critMins: number): { dot: string; text: string; label: string } {
  if (!date) return { dot: "#ef4444", text: "#ef4444", label: "Never" };
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins <= warnMins) return { dot: "#22c55e", text: "#16a34a", label: "Healthy" };
  if (mins <= critMins) return { dot: "#f59e0b", text: "#d97706", label: "Slow" };
  return { dot: "#ef4444", text: "#ef4444", label: "Stalled" };
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

    const [stats] = await Promise.all([fetchPipelineStats(params.episodeGuid)]);

    const airDate = formatAirDate(params.datePublished);
    const subjectDate = formatSubjectDate(params.datePublished);
    const queuedAtStr = stats.queuedAt.toLocaleTimeString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York"
    });

    const transcriptHealth = healthColor(stats.lastTranscriptAt, 60, 180);
    const recapHealth = healthColor(stats.lastRecapAt, 120, 360);

    const pipelineUrl = "https://podrise.com/admin/internal-tools/pipeline";
    const alertsUrl = "https://podrise.com/admin/internal-tools/alerts";

    const overallStalled = transcriptHealth.label === "Stalled" || recapHealth.label === "Stalled";
    const overallSlow = !overallStalled && (transcriptHealth.label === "Slow" || recapHealth.label === "Slow");

    const headerBg = overallStalled ? "#ef4444" : overallSlow ? "#f59e0b" : "#6366f1";
    const statusLabel = overallStalled ? "⚠️ Pipeline May Be Stalled" : overallSlow ? "🔶 Pipeline Running Slow" : "✅ Pipeline Healthy";

    const subject = `[${subjectDate}] ${params.podcastName} — New Episode Queued`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">

        <!-- Header -->
        <tr>
          <td style="background:${headerBg};padding:20px 28px;">
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.75);">PodRise · Pipeline Alert</p>
            <p style="margin:6px 0 0;font-size:20px;font-weight:800;color:#ffffff;line-height:1.3;">New Episode Queued</p>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.85);">${statusLabel}</p>
          </td>
        </tr>

        <!-- Episode info -->
        <tr>
          <td style="padding:24px 28px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #e4e4e7;">
                  <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#71717a;">Podcast</p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:#18181b;">${escapeHtml(params.podcastName)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #e4e4e7;">
                  <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#71717a;">Episode</p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:#18181b;line-height:1.45;">${escapeHtml(params.episodeTitle)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%" style="padding:14px 18px;border-right:1px solid #e4e4e7;">
                        <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#71717a;">Air Date</p>
                        <p style="margin:0;font-size:13px;color:#3f3f46;font-weight:600;">${airDate}</p>
                      </td>
                      <td width="50%" style="padding:14px 18px;">
                        <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#71717a;">Queued At</p>
                        <p style="margin:0;font-size:13px;color:#3f3f46;font-weight:600;">${queuedAtStr}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Pipeline Health -->
        <tr>
          <td style="padding:16px 28px 0;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#71717a;">Pipeline Health</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">

              <!-- Queue stats row -->
              <tr style="background:#f9fafb;border-bottom:1px solid #e4e4e7;">
                <td style="padding:12px 18px;" colspan="3">
                  <p style="margin:0 0 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#71717a;">Transcript Queue</p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-right:20px;">
                        <span style="font-size:18px;font-weight:800;color:#6366f1;">${stats.queuePending}</span>
                        <span style="font-size:11px;color:#71717a;margin-left:4px;">pending</span>
                      </td>
                      <td style="padding-right:20px;">
                        <span style="font-size:18px;font-weight:800;color:#22c55e;">${stats.queueInProgress}</span>
                        <span style="font-size:11px;color:#71717a;margin-left:4px;">in progress</span>
                      </td>
                      <td style="padding-right:20px;">
                        <span style="font-size:18px;font-weight:800;color:${stats.queueFailed > 0 ? "#ef4444" : "#a1a1aa"};">${stats.queueFailed}</span>
                        <span style="font-size:11px;color:#71717a;margin-left:4px;">failed</span>
                      </td>
                      ${stats.queuePosition !== null ? `<td>
                        <span style="font-size:12px;font-weight:700;color:#6366f1;background:#ede9fe;padding:2px 8px;border-radius:20px;">
                          #${stats.queuePosition} in line
                        </span>
                      </td>` : ""}
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Last transcript -->
              <tr style="border-bottom:1px solid #e4e4e7;">
                <td style="padding:12px 18px;" width="50%">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#71717a;">Last Transcript Fetched</p>
                  <p style="margin:0;font-size:14px;font-weight:700;color:${transcriptHealth.text};">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${transcriptHealth.dot};margin-right:5px;vertical-align:middle;"></span>
                    ${timeAgoShort(stats.lastTranscriptAt)}
                  </p>
                  <p style="margin:2px 0 0;font-size:11px;color:#a1a1aa;">
                    ${stats.lastTranscriptAt ? stats.lastTranscriptAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" }) : "—"}
                  </p>
                </td>
                <td style="padding:12px 18px;border-left:1px solid #e4e4e7;" width="50%">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#71717a;">Last Recap Generated</p>
                  <p style="margin:0;font-size:14px;font-weight:700;color:${recapHealth.text};">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${recapHealth.dot};margin-right:5px;vertical-align:middle;"></span>
                    ${timeAgoShort(stats.lastRecapAt)}
                  </p>
                  <p style="margin:2px 0 0;font-size:11px;color:#a1a1aa;">
                    ${stats.lastRecapAt ? stats.lastRecapAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" }) : "—"}
                  </p>
                </td>
              </tr>

              <!-- 24h stats -->
              <tr style="background:#f9fafb;">
                <td style="padding:10px 18px;" colspan="2">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>
                        <span style="font-size:11px;color:#71717a;">Last 24h: </span>
                        <span style="font-size:12px;font-weight:700;color:#18181b;">${stats.transcriptsLast24h} transcript${stats.transcriptsLast24h !== 1 ? "s" : ""}</span>
                        <span style="font-size:11px;color:#a1a1aa;margin:0 8px;">·</span>
                        <span style="font-size:12px;font-weight:700;color:#18181b;">${stats.recapsLast24h} recap${stats.recapsLast24h !== 1 ? "s" : ""}</span>
                        <span style="font-size:11px;color:#71717a;"> generated</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- GUID (collapsed, for debug) -->
        <tr>
          <td style="padding:12px 28px 0;">
            <p style="margin:0;font-size:11px;color:#a1a1aa;">
              GUID: <span style="font-family:monospace;word-break:break-all;">${escapeHtml(params.episodeGuid)}</span>
            </p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:20px 28px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:12px;">
                  <a href="${pipelineUrl}"
                     style="display:inline-block;padding:11px 22px;background:#6366f1;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;border-radius:9px;">
                    Pipeline Dashboard →
                  </a>
                </td>
                ${overallStalled ? `<td>
                  <a href="${alertsUrl}"
                     style="display:inline-block;padding:11px 22px;background:#fef2f2;color:#ef4444;text-decoration:none;font-size:13px;font-weight:700;border-radius:9px;border:1px solid #fecaca;">
                    ⚠️ Check Alerts
                  </a>
                </td>` : ""}
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e4e4e7;">
            <p style="margin:0;font-size:11px;color:#a1a1aa;text-align:center;">
              PodRise Pipeline · <a href="${alertsUrl}" style="color:#a1a1aa;">Manage alert subscriptions</a>
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
