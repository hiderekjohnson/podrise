export function markdownToEmailHtml(markdown: string, recipientEmail: string): string {
  const manageLink = `<div style="text-align:center;margin:16px 0 8px 0;"><a href="https://podcap.io/login" style="color:#2563eb;font-size:12px;text-decoration:underline;">Manage your podcasts</a></div>`;

  let html = markdown
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:underline;" target="_blank">$1</a>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#1a1a1a;font-size:22px;font-weight:700;margin:28px 0 12px 0;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">$1</h2>')
    .replace(/^\*\*(.+?)\*\*$/gm, '<p style="font-weight:700;color:#1a1a1a;margin:8px 0;">$1</p>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="color:#6b7280;">$1</em>')
    .replace(/^> "(.+)"$/gm, '<blockquote style="border-left:4px solid #2563eb;padding:12px 16px;margin:16px 0;background:#f0f7ff;border-radius:0 8px 8px 0;font-style:italic;color:#1e40af;font-size:15px;">"$1"</blockquote>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:4px solid #2563eb;padding:12px 16px;margin:16px 0;background:#f0f7ff;border-radius:0 8px 8px 0;font-style:italic;color:#1e40af;font-size:15px;">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li style="margin:6px 0;color:#374151;line-height:1.6;">$1</li>')
    .replace(/^---$/gm, `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">${manageLink}`)
    .replace(/\n\n/g, '</p><p style="color:#374151;line-height:1.7;margin:8px 0;">')
    .replace(/<\/p><p[^>]*>(<h2|<hr|<blockquote|<li)/g, '$1')
    .replace(/(<\/h2>|<\/hr>|<\/blockquote>|<\/li>)<\/p>/g, '$1');

  const liGroups = html.replace(/(<li[^>]*>.*?<\/li>)(\s*<li)/g, '$1$2');
  html = liGroups.replace(/(<li[^>]*>.*?<\/li>(?:\s*<li[^>]*>.*?<\/li>)*)/g, '<ul style="padding-left:20px;margin:12px 0;">$1</ul>');

  const topBanner = `<div style="background:#f0f7ff;border:1px solid #dbeafe;border-radius:8px;padding:12px 16px;margin-bottom:20px;text-align:center;">
        <p style="color:#1e40af;font-size:13px;margin:0;">Want to add or remove podcasts from your daily summary? <a href="https://podcap.io/login" style="color:#2563eb;font-weight:600;text-decoration:underline;">Manage your podcasts here</a></p>
      </div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PodCap Daily Digest</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:32px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:28px;font-weight:800;margin:0;letter-spacing:-0.5px;">☕ PodCap Daily</h1>
      <p style="color:#bfdbfe;font-size:14px;margin:8px 0 0 0;">Your personalized podcast digest</p>
    </div>
    <div style="padding:24px 28px;">
      ${topBanner}
      ${html}
    </div>
    <div style="background:#f9fafb;padding:20px 28px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        You're receiving this because you signed up for PodCap Daily.
      </p>
      <p style="color:#9ca3af;font-size:12px;margin:4px 0 0 0;">
        <a href="https://podcap.io/login" style="color:#9ca3af;text-decoration:underline;">Manage your podcasts</a> · Sent to ${recipientEmail}
      </p>
    </div>
  </div>
</body>
</html>`;
}
