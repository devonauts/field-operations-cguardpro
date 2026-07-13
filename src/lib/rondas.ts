import { api, tenantPath, asRows, unwrap } from "./api";
import { uploadToStorage } from "./services";
import {
  RondaRoute,
  RondaCheckpoint,
  TagScanInput,
  TagScan,
} from "@/types/rondas";

/**
 * Rondas service — wired to the backend `site-tour` endpoints.
 * (Discovered, not invented — see src/api/siteTour.ts.)
 */
export const rondasService = {
  /** List patrol routes (tours) for the tenant. */
  routes: (params?: Record<string, any>) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return api.get(tenantPath(`/site-tour${qs}`)).then((r) => asRows<RondaRoute>(r));
  },

  route: (id: string) => api.get(tenantPath(`/site-tour/${id}`)).then(unwrap),

  /** Checkpoints (tags) for a route. */
  tags: (tourId: string) =>
    api.get(tenantPath(`/site-tour/${tourId}/tags`)).then((r) => asRows<RondaCheckpoint>(r)),

  /** Checkpoints (tags) for a post site (across routes). */
  tagsByPostSite: (postSiteId: string) =>
    api
      .get(tenantPath(`/post-site/${postSiteId}/site-tour-tags`))
      .then((r) => asRows<RondaCheckpoint>(r)),

  /** Scans for the current context (optionally by assignment). */
  scans: (params?: Record<string, any>) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return api.get(tenantPath(`/site-tour/tag-scans${qs}`)).then((r) => asRows<TagScan>(r));
  },

  /**
   * Record a checkpoint scan. The backend resolves the tag by `tagIdentifier`,
   * finds the active assignment, and is idempotent per (assignment, tag).
   */
  scan: (input: TagScanInput) =>
    api.post(tenantPath("/site-tour/tag-scan"), input).then(unwrap),

  /** Upload evidence photo for a scan → descriptor (store url in scannedData). */
  uploadPhoto: (file: File) => uploadToStorage(file, "incidentImageUrl"),

  /** Effective patrol settings for the guard's post (enforcement config). */
  settings: () => api.get(tenantPath("/guard/me/ronda-settings")).then(unwrap),

  /** The guard's patrol history (assignments) — current shift day only. */
  patrols: () => api.get(tenantPath("/guard/me/patrols")).then((r) => asRows(r)),

  /** Full detail of one of my rounds (checkpoints + scans/photos/notes). */
  patrolDetail: (id: string) => api.get(tenantPath(`/guard/me/patrols/${id}`)).then(unwrap),

  /** Full detail of ANY round (supervisor view, staff-scoped). */
  rondaDetail: (id: string) => api.get(tenantPath(`/site-tour/ronda/${id}`)).then(unwrap),

  /** Mark the start of a patrol (stamps startAt + notifies tenant/client). */
  /** Finish a patrol — backend alerts ops if it ends incomplete. */
  finishPatrol: (tourId: string) =>
    api.post(tenantPath("/guard/me/patrol/finish"), { data: { tourId } }).then(unwrap),
  startPatrol: (tourId: string) =>
    api.post(tenantPath("/guard/me/patrol/start"), { data: { tourId } }).then(unwrap),

  /** Register this device's FCM token for push (with the stable deviceId so the
   *  token attaches to the guard's real device row, not a duplicate). */
  registerDeviceToken: (token: string, deviceId?: string | null) =>
    api.post(tenantPath("/guard/me/device-token"), { data: { token, deviceId } }).then(unwrap),

  /** Report this device's identity (deviceId + model/OS/app version) — bind/flag. */
  registerDevice: (data: Record<string, any>) =>
    api.post(tenantPath("/guard/me/device"), { data }).then(unwrap),

  /* ---- Supervisor/admin (require postSiteCreate permission) ---- */
  createRoute: (data: Record<string, any>) =>
    api.post(tenantPath("/site-tour"), data).then(unwrap),
  updateRoute: (id: string, data: Record<string, any>) =>
    api.put(tenantPath(`/site-tour/${id}`), data).then(unwrap),
  addTag: (tourId: string, data: Record<string, any>) =>
    api.post(tenantPath(`/site-tour/${tourId}/tag`), data).then(unwrap),
  assign: (tourId: string, guardId: string, extra: Record<string, any> = {}) =>
    api.post(tenantPath(`/site-tour/${tourId}/assign`), { guardId, ...extra }).then(unwrap),
  assignments: (tourId: string) =>
    api.get(tenantPath(`/site-tour/${tourId}/assignments`)).then((r) => asRows(r)),
};

/* ------------------------------------------------------------------ */
/* Consignas específicas — recurring station standing orders           */
/* ------------------------------------------------------------------ */
export interface ConsignaItem {
  id: string; title: string; description?: string; time?: string;
  priority: "alta" | "media" | "baja"; recurrence: string;
  stationId: string; stationName?: string; dueAt?: string; occurrenceDate: string;
  done: boolean; completion?: any;
}

export const consignasService = {
  /** Today's due consignas for my station(s). */
  orders: () => api.get(tenantPath("/guard/me/orders")).then((r) => asRows<ConsignaItem>(r)),
  /** Complete today's occurrence with evidence. */
  complete: (orderId: string, data: any) =>
    api.post(tenantPath(`/guard/me/orders/${orderId}/complete`), { data }).then(unwrap),
  /** Upload a photo / video / audio voice-note → stored privateUrl. */
  uploadMedia: async (file: File) =>
    (await uploadToStorage(file, "guardConsignaMedia")).privateUrl,
};

/* ------------------------------------------------------------------ */
/* Memos — communications addressed to me by my supervisors            */
/* ------------------------------------------------------------------ */
export interface MemoItem {
  id: string;
  subject?: string;
  content?: string;
  dateTime?: string;
  wasAccepted: boolean;
  createdByName?: string | null;
}

export const memosService = {
  /** Memos addressed to me, newest first. */
  list: () => api.get(tenantPath("/guard/me/memos")).then((r) => asRows<MemoItem>(r)),
  /** Acknowledge (accept) a memo. */
  accept: (memoId: string) =>
    api.post(tenantPath(`/guard/me/memos/${memoId}/accept`), {}).then(unwrap),
};
