const decode = (s) =>
  s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');

export function lawaText(html) {
  return decode(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function parseLawaSwimPage(html) {
  const text = lawaText(html);
  const latest = firstMatch(text, [
    /Latest\s+(?:E\.\s*coli|enterococci)\s+result\s*([^|]{1,80}?)(?=The weekly sampling result|Long-term grade|$)/i,
    /Weekly\s+result\s*([^|]{1,60}?)(?=Long-term grade|Water quality|$)/i,
  ]);
  const longTerm = firstMatch(text, [
    /Long-term\s+(?:E\.\s*coli|enterococci)\s+grade(?:\s*5\s*year\s*sampling)?\s*([^|]{1,60}?)(?=The long-term grade|Reminder|$)/i,
    /(?:No recent data|Suitable for swimming|Caution advised|Unsuitable for swimming)\s+(Excellent|Good|Fair|Poor|Not available)\s+(?:No recent data|Suitable for swimming|Caution advised|Unsuitable for swimming)/i,
  ]);

  // LAWA also places the two headline statuses near the top of the page.
  const headline = text.match(
    /\b(No recent data|Suitable for swimming|Caution advised|Unsuitable for swimming)\b\s+\b(Excellent|Good|Fair|Poor|Not available)\b/i,
  );

  return {
    latest: latest || headline?.[1] || null,
    longTerm: longTerm || headline?.[2] || null,
  };
}

export async function fetchLawaSummary(spot, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const pageUrl = spot.lawa?.pageUrl || spot.conditionsSource?.url || "";
  let url;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.hostname !== "www.lawa.org.nz" || !url.pathname.includes("/explore-data/"))
    return null;
  if (url.pathname === "/explore-data/swimming" || url.pathname === "/explore-data/swimming/")
    return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html",
        "User-Agent": "SwimspotsNZ/1.0 (+https://swimspots.nz)",
      },
      redirect: "follow",
    });
    if (!response.ok) throw new Error("LAWA unavailable");
    const summary = parseLawaSwimPage(await response.text());
    return {
      ...summary,
      pageUrl: response.url || url.toString(),
      source: "LAWA",
    };
  } finally {
    clearTimeout(timer);
  }
}
