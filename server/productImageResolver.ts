export async function resolveProductImage(purchaseUrl: string): Promise<string | null> {
  try {
    const normalizedUrl = purchaseUrl.match(/^https?:\/\//) ? purchaseUrl : `https://${purchaseUrl}`;
    const domain = new URL(normalizedUrl).hostname.replace(/^www\./, "");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(normalizedUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PodRise/1.0)" },
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const html = await resp.text();
      const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

      if (ogMatch?.[1]) {
        let ogUrl = ogMatch[1].trim();
        if (ogUrl.startsWith("//")) ogUrl = "https:" + ogUrl;
        else if (ogUrl.startsWith("/")) ogUrl = `https://${domain}${ogUrl}`;
        ogUrl = ogUrl.replace(/^http:\/\//, "https://");

        if (ogUrl.startsWith("http") && ogUrl.length < 500) {
          try {
            const imgCheck = await fetch(ogUrl, { method: "HEAD", signal: AbortSignal.timeout(5000), redirect: "follow" });
            const ct = imgCheck.headers.get("content-type") || "";
            if (imgCheck.ok && ct.startsWith("image/")) {
              console.log(`[ProductImage] OG image found for ${domain}: ${ogUrl.substring(0, 80)}`);
              return ogUrl;
            }
          } catch {}
        }
      }
    }

    const logoDevKey = process.env.LOGO_DEV_PUBLIC_KEY;
    if (logoDevKey) {
      const logoUrl = `https://img.logo.dev/${domain}?token=${logoDevKey}&format=png&size=128`;
      try {
        const logoCheck = await fetch(logoUrl, { method: "HEAD", signal: AbortSignal.timeout(5000), redirect: "follow" });
        if (logoCheck.ok) {
          console.log(`[ProductImage] Logo.dev fallback for ${domain}`);
          return logoUrl;
        }
      } catch {}
    }

    console.log(`[ProductImage] No image found for ${domain}`);
    return null;
  } catch (err) {
    console.error(`[ProductImage] Error resolving image for ${purchaseUrl}:`, err);
    return null;
  }
}
