export type UrlMetadata = {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  canonical?: string | null;
  siteName?: string | null;
  favicon?: string | null;
};

function pickMeta(html: string, names: string[]) {
  for (const name of names) {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    );
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return null;
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export async function fetchUrlMetadata(url: string): Promise<UrlMetadata> {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 SharebookPhase0A/0.1 (+https://github.com/nitro41992/sharebook)"
      },
      signal: AbortSignal.timeout(7000)
    });

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const canonicalMatch = html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i
    );
    const iconMatch = html.match(
      /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i
    );

    return {
      title: pickMeta(html, ["og:title", "twitter:title"]) ?? titleMatch?.[1]?.trim() ?? null,
      description: pickMeta(html, ["og:description", "twitter:description", "description"]),
      image: pickMeta(html, ["og:image", "twitter:image"]),
      canonical: canonicalMatch?.[1] ?? url,
      siteName: pickMeta(html, ["og:site_name"]),
      favicon: iconMatch?.[1] ?? null
    };
  } catch {
    return {
      canonical: url
    };
  }
}
