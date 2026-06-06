const API_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "https://api.cguardpro.com/api"
).replace(/\/+$/, "");

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/** Resolve a usable logo image URL from a post-site `logo` file array (or null). */
export function postSiteLogoUrl(postSite: any): string | null {
  const logo = postSite?.logo;
  const file = Array.isArray(logo) ? logo[0] : logo;
  if (!file) return null;
  const raw = file.publicUrl || file.downloadUrl || file.url || file.privateUrl;
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  // Relative path stored on the server → serve from the API origin.
  const origin = API_BASE.replace(/\/api$/, "");
  return `${origin}/${String(raw).replace(/^\/+/, "")}`;
}

/** A dark, hybrid Google static map of the site for the on-duty hero backdrop. */
export function staticMapUrl(
  lat: any,
  lng: any,
  w = 640,
  h = 360
): string | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (!MAPS_KEY || Number.isNaN(la) || Number.isNaN(ln) || (la === 0 && ln === 0))
    return null;
  const params = new URLSearchParams({
    center: `${la},${ln}`,
    zoom: "17",
    size: `${w}x${h}`,
    scale: "2",
    maptype: "hybrid",
    key: MAPS_KEY,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}&markers=color:0xd4a017%7C${la},${ln}`;
}
