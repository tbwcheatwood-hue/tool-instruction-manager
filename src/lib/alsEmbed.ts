/** Same-origin path proxied by Next (see next.config.ts). Avoids cross-origin iframe glitches. */
export const ALS_EMBED_PREFIX = "/als-studio";

export function alsEmbedSrc(alsApiUrl: string): { src: string; proxied: boolean } {
  const fallback = (alsApiUrl || "http://127.0.0.1:8080").replace(/\/$/, "");
  try {
    const u = new URL(fallback);
    const isLocalLoopback =
      (u.hostname === "127.0.0.1" || u.hostname === "localhost") && u.protocol === "http:" && (u.port === "8080" || u.port === "");
    if (isLocalLoopback) {
      // Must load index.html (not /als-studio/) so relative ui/js/* resolves under /als-studio/.
      // Next redirects /als-studio/ → /als-studio which breaks script paths (/ui/… 404).
      return { src: `${ALS_EMBED_PREFIX}/index.html`, proxied: true };
    }
  } catch {
    /* use direct */
  }
  return { src: fallback, proxied: false };
}
