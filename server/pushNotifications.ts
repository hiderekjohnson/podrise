import { pool } from "./db";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushNotification(userId: number, payload: PushPayload): Promise<number> {
  const { rows: tokens } = await pool.query(
    `SELECT device_token, platform FROM device_tokens WHERE user_id = $1`,
    [userId]
  );

  if (tokens.length === 0) return 0;

  let sent = 0;
  for (const row of tokens) {
    try {
      if (row.platform === "ios") {
        await sendApnsPush(row.device_token, payload);
        sent++;
      }
    } catch (err: any) {
      console.error(`[Push] Failed to send to device ${row.device_token.slice(0, 8)}...: ${err.message}`);
      if (isInvalidToken(err)) {
        await pool.query(`DELETE FROM device_tokens WHERE device_token = $1`, [row.device_token]);
        console.log(`[Push] Removed invalid device token ${row.device_token.slice(0, 8)}...`);
      }
    }
  }

  return sent;
}

export async function sendPushToMultipleUsers(userIds: number[], payload: PushPayload): Promise<number> {
  let totalSent = 0;
  for (const userId of userIds) {
    try {
      totalSent += await sendPushNotification(userId, payload);
    } catch (err: any) {
      console.error(`[Push] Error sending to user ${userId}: ${err.message}`);
    }
  }
  return totalSent;
}

async function sendApnsPush(deviceToken: string, payload: PushPayload): Promise<void> {
  const apnsKeyId = process.env.APNS_KEY_ID;
  const apnsTeamId = process.env.APNS_TEAM_ID;
  const apnsKey = process.env.APNS_KEY;
  const apnsBundleId = process.env.APNS_BUNDLE_ID || "io.podcap.app";

  if (!apnsKeyId || !apnsTeamId || !apnsKey) {
    console.log(`[Push] APNs not configured — skipping push to ${deviceToken.slice(0, 8)}...`);
    return;
  }

  const jwt = await generateApnsJwt(apnsKeyId, apnsTeamId, apnsKey);
  const isProduction = process.env.APNS_ENVIRONMENT !== "sandbox";
  const host = isProduction ? "api.push.apple.com" : "api.sandbox.push.apple.com";

  const apnsPayload = {
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: "default",
      badge: 1,
    },
    ...payload.data,
  };

  const response = await fetch(`https://${host}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      "authorization": `bearer ${jwt}`,
      "apns-topic": apnsBundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(apnsPayload),
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`APNs error ${response.status}: ${body}`);
    (error as any).statusCode = response.status;
    (error as any).responseBody = body;
    throw error;
  }
}

async function generateApnsJwt(keyId: string, teamId: string, key: string): Promise<string> {
  const { default: jsonwebtoken } = await import("jsonwebtoken");
  const privateKey = key.includes("BEGIN") ? key : `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
  return jsonwebtoken.sign({}, privateKey, {
    algorithm: "ES256",
    keyid: keyId,
    issuer: teamId,
    expiresIn: "1h",
  });
}

function isInvalidToken(err: any): boolean {
  if (err.statusCode === 410) return true;
  if (err.statusCode === 400) {
    try {
      const body = JSON.parse(err.responseBody || "{}");
      return body.reason === "BadDeviceToken" || body.reason === "Unregistered";
    } catch {}
  }
  return false;
}

export async function notifyRecapReady(userId: number, podcastName: string): Promise<void> {
  try {
    await sendPushNotification(userId, {
      title: "Your daily recap is ready",
      body: `New insights from ${podcastName} and more`,
      data: { type: "recap_ready" },
    });
  } catch (err: any) {
    console.error(`[Push] Failed recap notification for user ${userId}: ${err.message}`);
  }
}

export async function notifyNewEpisode(userId: number, podcastName: string, episodeTitle: string, podcastSlug: string, episodeSlug: string): Promise<void> {
  try {
    await sendPushNotification(userId, {
      title: podcastName,
      body: `New episode recap: ${episodeTitle}`,
      data: {
        type: "new_episode",
        podcastSlug,
        episodeSlug,
      },
    });
  } catch (err: any) {
    console.error(`[Push] Failed episode notification for user ${userId}: ${err.message}`);
  }
}
