import { DEFAULT_ALS_API_URL } from "../../shared/alsPorts";

/** Same-origin ALS embed when ALS is proxied through the T.I.M. PHP server. */
export const ALS_EMBED_PREFIX = "/als-studio";

export function alsEmbedSrc(alsApiUrl: string): { src: string; proxied: boolean } {
  const fallback = (alsApiUrl || DEFAULT_ALS_API_URL).replace(/\/$/, "");
  try {
    const u = new URL(fallback, typeof window !== "undefined" ? window.location.origin : DEFAULT_ALS_API_URL);
    const isLocal =
      (u.hostname === "127.0.0.1" || u.hostname === "localhost") && u.protocol === "http:";
    const samePortAsPage =
      typeof window !== "undefined" &&
      window.location.protocol === "http:" &&
      (u.hostname === window.location.hostname || u.hostname === "127.0.0.1" || u.hostname === "localhost") &&
      (u.port === window.location.port || (u.port === "" && (window.location.port === "80" || window.location.port === "")));
    if (isLocal && samePortAsPage) {
      return { src: `${ALS_EMBED_PREFIX}/index.html`, proxied: true };
    }
  } catch {
    /* use direct */
  }
  return { src: `${fallback}/`, proxied: false };
}
