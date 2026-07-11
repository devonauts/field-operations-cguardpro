import { api, tenantPath } from "./api";

/**
 * Visitor pre-authorization — a client pre-authorizes a visitor in the customer
 * app, which shows a QR pass. The on-shift guard scans it here to validate it and
 * auto-create the visit (the backend creates the visitor log on success).
 *
 * Backend: POST /tenant/:tenantId/visitor-preauth/scan  { qrToken }
 */

/** Why a pre-auth pass was rejected (maps to a friendly message in the UI). */
export type PreAuthFailReason =
  | "already_used"
  | "revoked"
  | "not_yet_valid"
  | "expired"
  | "station_mismatch"
  | "not_found";

export interface PreAuthVisitor {
  firstName: string;
  lastName: string;
  idNumber?: string;
  reason?: string;
  company?: string;
  vehiclePlate?: string;
  stationName?: string;
}

export type PreAuthScanResult =
  | { valid: true; visitorLogId: string; visitor: PreAuthVisitor }
  | { valid: false; reason: PreAuthFailReason };

/**
 * Validate a scanned visitor pre-auth QR token. On success the backend has
 * already created the visitor log (returns its id + the visitor details).
 */
export function scanVisitorPreAuth(qrToken: string): Promise<PreAuthScanResult> {
  return api.post<PreAuthScanResult>(tenantPath("/visitor-preauth/scan"), {
    qrToken,
  });
}
