// Registers the replay functions for every queued mutation kind. Imported once
// for its side effects (see main.tsx) — kept separate from offlineQueue.ts so the
// queue core stays dependency-free (no import cycle with services).

import { registerReplayer } from "./offlineQueue";
import { incidentService } from "./services";
import { dataUrlToFile } from "./capture";

export interface QueuedIncident {
  data: Record<string, any>;
  photoDataUrls?: string[];
  asGuard?: boolean;
}

// Incident report: re-upload any deferred photos, then create. Mirrors the online
// path in IncidentForm.submit().
registerReplayer("incident.create", async (payload: QueuedIncident) => {
  const { data, photoDataUrls, asGuard } = payload;
  const descriptors: any[] = [];
  for (const durl of photoDataUrls || []) {
    try {
      const up = await incidentService.uploadPhoto(dataUrlToFile(durl, `incident-${Date.now()}.jpg`));
      descriptors.push({ ...up, new: true });
    } catch {
      /* a dropped photo shouldn't block the report itself */
    }
  }
  const photoField = descriptors.length ? descriptors : undefined;
  const createFn = asGuard ? incidentService.createAsGuard : incidentService.create;
  await createFn({ ...data, idPhoto: photoField, imageUrl: photoField });
});
