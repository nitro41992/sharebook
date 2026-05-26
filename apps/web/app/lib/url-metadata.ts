export type UrlMetadata = {
  provider?: string | null;
  type?: string | null;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  canonical?: string | null;
  siteName?: string | null;
  favicon?: string | null;
  authorName?: string | null;
  authorUrl?: string | null;
};

function oembedEndpoint(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be" || host === "music.youtube.com") {
      return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    }
    if (host === "reddit.com" || host.endsWith(".reddit.com")) {
      return `https://www.reddit.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchUrlMetadata(url: string): Promise<UrlMetadata> {
  const endpoint = oembedEndpoint(url);
  if (!endpoint) return { canonical: url };

  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "user-agent": "Sharebook/0.1 (+https://github.com/nitro41992/sharebook)"
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) return { canonical: url };
    const data = await response.json();

    return {
      provider: "oembed",
      type: typeof data.type === "string" ? data.type : null,
      title: typeof data.title === "string" ? data.title : null,
      description: null,
      image: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
      canonical: url,
      siteName: typeof data.provider_name === "string" ? data.provider_name : null,
      favicon: null,
      authorName: typeof data.author_name === "string" ? data.author_name : null,
      authorUrl: typeof data.author_url === "string" ? data.author_url : null
    };
  } catch {
    return {
      canonical: url
    };
  }
}
