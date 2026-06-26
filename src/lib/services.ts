import { api, tenantPath, asRows, unwrap, getToken, getTenantId } from "./api";
import { setAppTimeZone } from "./format";

// Adopt the tenant timezone so all time formatting renders in the tenant's
// local time. Applied ONLY from the guard dashboard (/guard/me) — the single
// authoritative bootstrap payload — rather than as a side effect of arbitrary
// list/detail fetches, so display tz no longer depends on fetch ordering. It is
// cleared on signOut (see AuthContext).
const adoptTz = (d: any) => {
  if (d && d.timezone) setAppTimeZone(d.timezone);
  return d;
};

/* ------------------------------------------------------------------ */
/* Guard (field worker) — /tenant/:id/guard/me/*                       */
/* ------------------------------------------------------------------ */
export const guardService = {
  dashboard: () => api.get(tenantPath("/guard/me")).then(unwrap).then(adoptTz),
  schedule: (params?: { from?: string; to?: string }) => {
    const qs = params && (params.from || params.to)
      ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][]).toString()
      : "";
    return api.get(tenantPath("/guard/me/schedule") + qs).then(unwrap);
  },
  /** Summary of my most recent completed shift (off-duty "last shift" card). */
  lastShift: () => api.get(tenantPath("/guard/me/last-shift")).then(unwrap),
  /** Guards on duty at my current sitio de servicio (team roster). */
  team: () => api.get(tenantPath("/guard/me/team")).then(unwrap),
  clockIn: (data: {
    stationId: string;
    latitude?: number;
    longitude?: number;
    shiftSchedule?: string;
    selfiePhoto?: string;
    address?: string;
    battery?: number | null;
    checklist?: any;
    platform?: string;
    device?: Record<string, any> | null;
  }) =>
    api
      .post(tenantPath("/guard/me/clock-in"), {
        // Tag the punch with the device platform for the Nómina audit trail.
        data: { platform: navigator?.userAgent ? "worker-app" : undefined, ...data },
      })
      .then(unwrap),
  /** Upload a clock-in selfie and return its stored privateUrl. */
  uploadSelfie: async (file: File) =>
    (await uploadToStorage(file, "guardShiftSelfie")).privateUrl,
  clockOut: (data: {
    latitude?: number;
    longitude?: number;
    observations?: string;
  }) => api.post(tenantPath("/guard/me/clock-out"), { data }).then(unwrap),
  /** Request supervisor approval to clock out early. */
  requestClockOut: (data?: { reason?: string }) =>
    api.post(tenantPath("/guard/me/clock-out/request"), { data: data || {} }).then(unwrap),
  /** Active early-clock-out request status (or { request: null }). */
  clockOutRequest: () =>
    api.get(tenantPath("/guard/me/clock-out/request")).then(unwrap),
  /** Withdraw my pending early-clock-out request (escape a stuck approval). */
  cancelClockOutRequest: () =>
    api.post(tenantPath("/guard/me/clock-out/request/cancel"), { data: {} }).then(unwrap),
  /** Request supervisor approval for a LATE clock-in (past the grace window). */
  clockInRequestCreate: (stationId: string, reason?: string) =>
    api
      .post(tenantPath("/guard/me/clock-in/request"), { data: { stationId, reason } })
      .then(unwrap),
  /** Active late clock-in request status for a station (or { request: null }). */
  clockInRequestGet: (stationId: string) =>
    api
      .get(
        tenantPath("/guard/me/clock-in/request?stationId=" + encodeURIComponent(stationId)),
      )
      .then(unwrap),
  /** Update my own contact details (phone/address) — notifies HR in the CRM. */
  updateProfile: (data: { phone?: string; address?: string }) =>
    api.patch(tenantPath("/guard/me/profile"), { data }).then(unwrap),
  /** Recent site activity for the on-duty home feed. */
  activity: () => api.get(tenantPath("/guard/me/activity")).then((r) => asRows(r)),
  timeOff: () => api.get(tenantPath("/guard/me/time-off")).then(unwrap),
  requestTimeOff: (data: {
    type: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }) => api.post(tenantPath("/guard/me/time-off"), { data }).then(unwrap),

  // Station security test (sanitized random N questions).
  quiz: () => api.get(tenantPath("/guard/me/quiz")).then(unwrap),
  submitQuiz: (data: {
    bankId: string;
    stationId?: string | null;
    startedAt?: string | null;
    answers: Array<{ questionId: string; chosenIndex: number }>;
  }) => api.post(tenantPath("/guard/me/quiz/submit"), { data }).then(unwrap),

  // Backup pool: open (at-risk) shifts I can cover + volunteering.
  backupOpen: () =>
    api.get(tenantPath("/guard/me/backup/open")).then((r) => asRows(r)),
  volunteerBackup: (data: {
    shiftId?: string;
    stationId?: string;
    eventDate?: string;
    notes?: string;
  }) =>
    api.post(tenantPath("/guard/me/backup/volunteer"), { data }).then(unwrap),
};

/* ------------------------------------------------------------------ */
/* Training (Entrenamiento) — /tenant/:id/guard/me/training/*          */
/* Professional courses assigned to the guard: lessons (video/text/    */
/* pdf), an optional quiz, points + a branded achievement certificate. */
/* ------------------------------------------------------------------ */
export interface TrainingCourseRow {
  id: string;
  courseId: string;
  courseTitle: string;
  status: "assigned" | "in_progress" | "completed" | "expired";
  progressPercentage: number;
  dueDate?: string | null;
  completedAt?: string | null;
}

export interface TrainingLessonView {
  id: string;
  order: number;
  title: string;
  description?: string | null;
  videoUrl?: string | null;
  richContent?: string | null;
  resources?: Array<{ name: string; url: string; type?: string }> | null;
  durationMinutes?: number | null;
  completed: boolean;
}

export interface TrainingEnrollmentDetail {
  id: string;
  courseId: string;
  courseTitle: string;
  status: "assigned" | "in_progress" | "completed" | "expired";
  progressPercentage: number;
  quizPassed: boolean;
  hasQuiz: boolean;
  quizBankId?: string | null;
  passPct?: number | null;
  lessons: TrainingLessonView[];
  /** Sanitized quiz questions to present (no correct answers); may be absent. */
  questions?: Array<{ id: string; prompt: string; options: string[] }> | null;
}

export interface TrainingCertificateRow {
  id: string;
  courseTitle: string;
  serialNumber: string;
  score?: number | null;
  issuedAt: string;
  publicUrl?: string | null;
  pointsValue?: number | null;
}

export interface TrainingCertificateDetail extends TrainingCertificateRow {
  guardName: string;
  htmlContent: string;
  downloadToken: string;
}

export const trainingService = {
  /** Courses assigned to me (all_guards templates are materialized per-guard). */
  myCourses: (params?: { status?: string; limit?: number; offset?: number }) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return api
      .get(tenantPath(`/guard/me/training/my-courses${qs}`))
      .then((r) => ({
        rows: asRows<TrainingCourseRow>(r),
        count: (r && (r.count ?? r.total)) ?? asRows(r).length,
      }));
  },
  /** Enrollment detail with ordered lessons + per-lesson completion + quiz info. */
  enrollmentDetail: (enrollmentId: string) =>
    api
      .get(tenantPath(`/guard/me/training/enrollments/${enrollmentId}/detail`))
      .then(unwrap) as Promise<TrainingEnrollmentDetail>,
  /** Mark a lesson complete; returns recomputed progress (auto-completes if no quiz). */
  completeLesson: (
    lessonId: string,
    data: { enrollmentId: string; timeSpentSeconds?: number },
  ) =>
    api
      .post(tenantPath(`/guard/me/training/lessons/${lessonId}/complete`), { data })
      .then(unwrap) as Promise<{
      id: string;
      completedAt: string;
      progressPercentage: number;
    }>,
  /** Submit the course quiz; graded server-side, issues a certificate on pass. */
  submitQuiz: (
    enrollmentId: string,
    data: {
      bankId: string;
      answers: Array<{ questionId: string; chosenIndex: number }>;
      startedAt?: string | null;
    },
  ) =>
    api
      .post(
        tenantPath(`/guard/me/training/enrollments/${enrollmentId}/submit-quiz`),
        { data },
      )
      .then(unwrap) as Promise<{
      id: string;
      total: number;
      correctCount: number;
      scorePct: number;
      passed: boolean;
      passPct: number;
      certificateId?: string | null;
    }>,
  /** My earned certificates (Mis logros). */
  certificates: (params?: { limit?: number; offset?: number }) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return api
      .get(tenantPath(`/guard/me/training/certificates${qs}`))
      .then((r) => ({
        rows: asRows<TrainingCertificateRow>(r),
        count: (r && (r.count ?? r.total)) ?? asRows(r).length,
      }));
  },
  /** A single certificate including its print-ready htmlContent + share token. */
  certificate: (certificateId: string) =>
    api
      .get(tenantPath(`/guard/me/training/certificates/${certificateId}`))
      .then(unwrap) as Promise<TrainingCertificateDetail>,
};

/* ------------------------------------------------------------------ */
/* Performance capture (supervisor) — uniform, backup confirmation     */
/* ------------------------------------------------------------------ */
export const performanceService = {
  // Uniform inspections (supervisor rates a guard/supervisor).
  createInspection: (data: {
    subjectUserId?: string;
    securityGuardId?: string;
    rating: number;
    stars?: number;
    notes?: string;
    photos?: any[];
    stationId?: string;
    inspectionDate?: string;
  }) => api.post(tenantPath("/uniform-inspection"), { data }).then(unwrap),
  uniformHistory: (securityGuardId: string) =>
    api
      .get(tenantPath(`/security-guard/${securityGuardId}/uniform-inspections`))
      .then((r) => asRows(r)),

  // Backup events for supervisors to confirm/reject.
  backupEvents: (status = "offered") =>
    api
      .get(tenantPath(`/backup-event?status=${encodeURIComponent(status)}`))
      .then((r) => asRows(r)),
  confirmBackup: (id: string) =>
    api.post(tenantPath(`/backup-event/${id}/confirm`), {}).then(unwrap),
  rejectBackup: (id: string) =>
    api.post(tenantPath(`/backup-event/${id}/reject`), {}).then(unwrap),
};

/* ------------------------------------------------------------------ */
/* Incidents — /tenant/:id/incident                                    */
/* ------------------------------------------------------------------ */
export const incidentService = {
  list: (params?: Record<string, any>) => {
    const qs = params
      ? "?" +
        new URLSearchParams(
          Object.entries(params).reduce((acc, [k, v]) => {
            if (v != null && v !== "") acc[k] = String(v);
            return acc;
          }, {} as Record<string, string>)
        ).toString()
      : "";
    return api.get(tenantPath(`/incident${qs}`)).then((r) => ({
      rows: asRows(r),
      count: (r && (r.count ?? r.total)) ?? asRows(r).length,
    }));
  },
  find: (id: string) => api.get(tenantPath(`/incident/${id}`)).then(unwrap),
  create: (data: Record<string, any>) =>
    api.post(tenantPath("/incident"), { data }).then(unwrap),
  /** Guard-scoped report (panic/events) — no admin incidentCreate permission. */
  createAsGuard: (data: Record<string, any>) =>
    api.post(tenantPath("/guard/me/incident"), { data }).then(unwrap),
  update: (id: string, data: Record<string, any>) =>
    api.put(tenantPath(`/incident/${id}`), { data }).then(unwrap),
  /**
   * Transition an incident's workflow status (Acknowledge → In Progress →
   * Resolved). Wraps the real `PUT /tenant/:id/incident/:id` endpoint
   * (incidentUpdate.ts, permission `incidentEdit`). Status is persisted in the
   * backend's Spanish vocabulary; an optional `note` is appended to
   * `internalNotes`/`comments` so the supervisor's reasoning is recorded.
   *
   * NOTE: there is NO incident-assignment endpoint on the backend (the incident
   * route exposes only create/update/find/list/destroy/dispatch, and no
   * guard-assignment field beyond the reporter `guardNameId`). An `assign()`
   * helper is therefore intentionally omitted — see the task report.
   */
  updateStatus: (id: string, status: string, note?: string) => {
    const data: Record<string, any> = { status };
    if (note && note.trim()) {
      data.internalNotes = note.trim();
      data.comments = note.trim();
    }
    return api.put(tenantPath(`/incident/${id}`), { data }).then(unwrap);
  },
  /** Upload evidence photo → descriptor for `imageUrl`/`idPhoto`. */
  uploadPhoto: (file: File) => uploadToStorage(file, "incidentImageUrl"),
};

/** Backend incident status vocabulary (Spanish) keyed by the app's canonical
 *  IncidentStatus enum. Used when transitioning an incident via updateStatus. */
export const INCIDENT_STATUS_VALUE: Record<string, string> = {
  open: "abierto",
  inProgress: "en_proceso",
  resolved: "resuelto",
  closed: "cerrado",
};

export const incidentTypeService = {
  list: () => api.get(tenantPath("/incidentType")).then((r) => asRows(r)),
};

/* ------------------------------------------------------------------ */
/* Operations KPIs / activities (supervisor dashboard)                 */
/* These are tenant-scoped via the auth'd user, NOT the path.          */
/* ------------------------------------------------------------------ */
export const operationsService = {
  kpis: (date?: string) =>
    api
      .get(`/operations/kpis${date ? `?date=${date}` : ""}`)
      .then((r) => asRows(r)),
  activities: (params?: { date?: string; since?: string }) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return api.get(`/operations/activities${qs}`).then((r) => asRows(r));
  },
};

/* ------------------------------------------------------------------ */
/* Guards (supervisor views) — active locations, list                  */
/* ------------------------------------------------------------------ */
export const guardsService = {
  activeLocations: () =>
    api.get(tenantPath("/security-guard/active-locations")).then((r) => asRows(r)),
  list: (params?: Record<string, any>) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return api.get(tenantPath(`/security-guard${qs}`)).then((r) => ({
      rows: asRows(r),
      count: (r && (r.count ?? r.total)) ?? asRows(r).length,
    }));
  },
  setOnDuty: (id: string, isOnDuty: boolean) =>
    api.patch(tenantPath(`/security-guard/${id}/on-duty`), { isOnDuty }).then(unwrap),
};

// NOTE: the legacy `patrolService` (patrol / patrol-checkpoint / patrol-log)
// was removed — patrols are consolidated on the siteTour system (see lib/rondas.ts).

/* ------------------------------------------------------------------ */
/* Shifts / schedule                                                   */
/* ------------------------------------------------------------------ */
export const shiftService = {
  list: (params?: Record<string, any>) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return api.get(tenantPath(`/guard-shift${qs}`)).then((r) => asRows(r));
  },
};

/* ------------------------------------------------------------------ */
/* Stations / posts                                                    */
/* ------------------------------------------------------------------ */
export const stationService = {
  list: () => api.get(tenantPath("/station")).then((r) => asRows(r)),
};

/* ------------------------------------------------------------------ */
/* Post site ("sitio de vigilancia") — logo, address, coordinates      */
/* ------------------------------------------------------------------ */
export const postSiteService = {
  find: (id: string) => api.get(tenantPath(`/post-site/${id}`)).then(unwrap),
};

/* ------------------------------------------------------------------ */
/* Visitor management (manejo de visitas) — visitor-log                */
/* ------------------------------------------------------------------ */
export interface VisitorPhoto {
  name: string;
  privateUrl: string;
  mimeType: string;
  sizeInBytes: number;
  fileToken?: string;
}

/**
 * Upload a file to backend storage (credentials → multipart upload) and return
 * the file descriptor for linking on create (e.g. `idPhoto`/`imageUrl`).
 */
export async function uploadToStorage(
  file: File,
  storageId: string
): Promise<VisitorPhoto> {
  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const cred = await api.get(
    tenantPath(
      `/file/credentials?filename=${encodeURIComponent(filename)}&storageId=${encodeURIComponent(storageId)}`
    )
  );
  const uploadUrl = cred?.uploadCredentials?.url;
  if (!uploadUrl) throw new Error("upload url unavailable");

  const form = new FormData();
  const fields = cred?.uploadCredentials?.fields || {};
  Object.entries(fields).forEach(([k, v]) => form.append(k, v as string));
  form.append("file", file, filename);

  const token = getToken();
  const resp = await fetch(uploadUrl, {
    method: "POST",
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: "include",
  });
  if (!resp.ok) throw new Error(`upload failed: ${resp.status}`);

  return {
    name: file.name,
    privateUrl: cred.privateUrl,
    mimeType: file.type || "image/jpeg",
    sizeInBytes: file.size,
    fileToken: cred.fileToken,
  };
}

export const visitorService = {
  list: (params?: Record<string, any>) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return api.get(tenantPath(`/visitor-log${qs}`)).then((r) => asRows(r));
  },
  create: (data: Record<string, any>) =>
    api.post(tenantPath("/visitor-log"), { data }).then(unwrap),
  checkout: (id: string) =>
    api
      .put(tenantPath(`/visitor-log/${id}`), {
        data: { exitTime: new Date().toISOString() },
      })
      .then(unwrap),

  /** Upload an ID/visit photo and get the descriptor for `idPhoto`. */
  uploadPhoto: (file: File) => uploadToStorage(file, "visitorLogIdPhoto"),
};

/* ------------------------------------------------------------------ */
/* Notices / announcements (legacy /notification route → GuardNotices) */
/* ------------------------------------------------------------------ */
export const notificationService = {
  list: (params?: Record<string, any>) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return api.get(tenantPath(`/notification${qs}`)).then((r) => asRows(r));
  },
};

/* ------------------------------------------------------------------ */
/* Platform events / notification center (tenant → guard)              */
/* These live at /<tenantId>/events — a DIFFERENT route namespace than  */
/* tenantPath() (/tenant/<id>/...), so paths are built manually.        */
/* ------------------------------------------------------------------ */
export interface PlatformEvent {
  id: string;
  eventType: string;
  title: string;
  body: string;
  payload?: Record<string, any> | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  deliveryStatus: "pending" | "sent" | "read";
  createdAt: string;
}

/** Base path for the events namespace (NOT tenantPath — see header above). */
const eventsPath = () => `/${getTenantId()}/events`;

export const eventService = {
  /** Recent events (newest first), capped by `limit`. */
  list: (limit = 30): Promise<PlatformEvent[]> =>
    api.get(`${eventsPath()}?limit=${limit}`).then((r) => asRows<PlatformEvent>(r)),
  /** Number of unread events for the badge. */
  unreadCount: (): Promise<number> =>
    api.get(`${eventsPath()}/unread`).then((r) => (r && typeof r.count === "number" ? r.count : 0)),
  /** Mark a single event as read. */
  markRead: (id: string): Promise<void> =>
    api.post(`${eventsPath()}/${id}/read`).then(() => undefined),
  /** Mark every event as read. */
  markAllRead: (): Promise<void> =>
    api.post(`${eventsPath()}/read-all`).then(() => undefined),
  /** Dismiss (delete) a single event. */
  remove: (id: string): Promise<void> =>
    api.delete(`${eventsPath()}/${id}`).then(() => undefined),
  /** Dismiss (delete) all events. */
  clearAll: (): Promise<void> =>
    api.delete(eventsPath()).then(() => undefined),
};

/* ------------------------------------------------------------------ */
/* Internal messaging (CRM ↔ this guard)                               */
/* ------------------------------------------------------------------ */
export const messageService = {
  /** My conversations: { rows, nextCursor }. */
  listThreads: (params?: Record<string, any>) => {
    const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    return api.get(tenantPath(`/guard/me/messages${qs}`)).then(unwrap);
  },
  /** A thread: { conversation, rows, nextCursor }. */
  thread: (id: string, params?: Record<string, any>) => {
    const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    return api.get(tenantPath(`/guard/me/messages/${id}${qs}`)).then(unwrap);
  },
  send: (id: string, body: string, clientMsgId: string, attachments?: MessageAttachment[]) =>
    api.post(tenantPath(`/guard/me/messages/${id}`), { data: { body, clientMsgId, attachments: attachments && attachments.length ? attachments : undefined } }).then(unwrap),
  /** Start a new conversation with the office/CRM. Returns { conversationId, message }. */
  create: (body: string, clientMsgId: string, attachments?: MessageAttachment[]) =>
    api.post(tenantPath(`/guard/me/messages`), { data: { body, clientMsgId, attachments: attachments && attachments.length ? attachments : undefined } }).then(unwrap),
  markRead: (id: string) =>
    api.post(tenantPath(`/guard/me/messages/${id}/read`), { data: {} }).then(unwrap),
  /** Upload an image/video/audio and return its attachment descriptor. */
  uploadAttachment: async (file: File): Promise<MessageAttachment> => {
    const up = await uploadToStorage(file, "messageAttachments");
    const mt = file.type || "";
    return {
      url: up.privateUrl,
      type: mt.startsWith("video") ? "video" : mt.startsWith("audio") ? "audio" : "image",
      name: file.name,
      sizeInBytes: file.size,
    };
  },
};

export type MessageAttachment = { url: string; type: "image" | "video" | "audio"; name?: string; sizeInBytes?: number };

/* ------------------------------------------------------------------ */
/* Radio check (pase de novedades) — the guard answers a roll-call     */
/* ------------------------------------------------------------------ */
export const radioCheckService = {
  /** My active radio-check request, if any: { entry } | { entry: null }. */
  pending: () => api.get(tenantPath("/guard/me/radio-check/pending")).then(unwrap),
  /** Reply with a voice clip (audioUrl), a canned line, or free text. */
  reply: (
    entryId: string,
    payload: { audioUrl?: string; cannedText?: string; text?: string; clientMsgId?: string },
  ) => api.post(tenantPath(`/guard/me/radio-check/entries/${entryId}/reply`), { data: payload }).then(unwrap),
  /** Upload a recorded voice clip; returns its stored privateUrl. */
  uploadAudio: async (file: File): Promise<string> =>
    (await uploadToStorage(file, "radioCheckAudio")).privateUrl,
};

/* ------------------------------------------------------------------ */
/* Reports / analytics                                                 */
/* ------------------------------------------------------------------ */
export const dashboardService = {
  stats: () => api.get(tenantPath("/dashboard/stats")).then(unwrap),
};

/* ------------------------------------------------------------------ */
/* Tareas — client-requested tasks for my station(s) (approved)        */
/* ------------------------------------------------------------------ */
export interface GuardTask {
  id: string;
  taskToDo: string;
  status: string;
  priority?: "alta" | "media" | "baja" | null;
  dateToDoTheTask?: string | null;
  taskBelongsToStation?: { id?: string; stationName?: string } | null;
}

export const taskService = {
  /** Approved, not-done tasks for my active station(s). */
  list: () => api.get(tenantPath("/guard/me/tasks")).then((r) => asRows<GuardTask>(r)),
  /** Mark a task done (optional note + photo file descriptors). */
  complete: (id: string, data?: { notes?: string; photo?: any[] }) =>
    api.post(tenantPath(`/guard/me/tasks/${id}/complete`), { data: data || {} }).then(unwrap),
};
