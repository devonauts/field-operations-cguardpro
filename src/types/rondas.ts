/**
 * Rondas (patrol rounds) types — mapped to the backend `siteTour` system:
 *   siteTour       → a patrol route (ronda)
 *   siteTourTag    → a checkpoint (QR/NFC/virtual tag); `tagIdentifier` = QR value
 *   tourAssignment → a route assigned to a guard
 *   tagScan        → a checkpoint scan event
 */

export type TagType = "qr" | "nfc" | "virtual" | "ble";

export type CheckpointScanStatus =
  | "pending"
  | "completed"
  | "late"
  | "wrong_checkpoint"
  | "skipped"
  | "issue";

export interface RondaCheckpoint {
  id: string;
  siteTourId?: string;
  name: string;
  tagType?: TagType;
  tagIdentifier: string; // value encoded in the QR
  location?: string;
  instructions?: string;
  latitude?: number;
  longitude?: number;
  showGeoFence?: boolean;
  postSiteId?: string;
  stationId?: string;
  orderIndex?: number;
}

export interface RondaRoute {
  id: string;
  name: string;
  description?: string;
  postSiteId?: string;
  stationId?: string;
  securityGuardId?: string;
  scheduledDays?: string[] | string;
  continuous?: boolean;
  timeMode?: string;
  maxDuration?: number;
  active: boolean;
  tags?: RondaCheckpoint[];
}

/** JSON payload stored in tagScan.scannedData. */
export interface ScanData {
  checkpointName?: string;
  notes?: string;
  status?: CheckpointScanStatus;
  photoPrivateUrl?: string;
  photoFileToken?: string;
  issueType?: string;
  device?: string;
  appVersion?: string;
}

export interface TagScanInput {
  tagIdentifier: string;
  latitude?: number;
  longitude?: number;
  stationId?: string;
  scannedData?: ScanData;
}

export interface TagScan {
  id: string;
  scannedAt: string;
  siteTourTagId?: string;
  tourAssignmentId?: string;
  stationId?: string;
  scannedData?: ScanData;
}

export interface RondaSettings {
  frequencyMinutes: number;
  roundsPerShift: number | null;
  graceMinutes: number;
  maxDurationMinutes: number;
  requirePhoto: boolean;
  requireGeofence: boolean;
  geofenceRadius: number;
  requireNote: boolean;
  notifyTenantOnStart: boolean;
  notifyTenantOnComplete: boolean;
  notifyTenantOnMissed: boolean;
  notifyClient: boolean;
}

export const DEFAULT_SETTINGS: RondaSettings = {
  frequencyMinutes: 60,
  roundsPerShift: null,
  graceMinutes: 10,
  maxDurationMinutes: 60,
  requirePhoto: true,
  requireGeofence: true,
  geofenceRadius: 50,
  requireNote: false,
  notifyTenantOnStart: true,
  notifyTenantOnComplete: true,
  notifyTenantOnMissed: true,
  notifyClient: false,
};

export const ISSUE_TYPES = [
  "unsafe_condition",
  "door_unlocked",
  "suspicious_activity",
  "equipment_issue",
  "missed_reason",
  "other",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];
