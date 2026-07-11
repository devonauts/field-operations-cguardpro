import { api } from "./api";

export interface Credentials {
  email: string;
  password: string;
}

export interface AuthPayload {
  token: string;
  user?: any;
}

export const AuthService = {
  signIn(credentials: Credentials): Promise<AuthPayload> {
    // `app` tags the session channel for single-active-session enforcement:
    // a login on a SECOND phone supersedes this one (401 sessionSuperseded →
    // back to login), while the same person's CRM web session is unaffected.
    return api.post<AuthPayload>("/auth/sign-in", { ...credentials, app: "worker" }, {
      skipAuth: true,
    });
  },

  getProfile(): Promise<any> {
    return api.get("/auth/me");
  },

  sendPasswordResetEmail(email: string): Promise<void> {
    // `app: "worker"` tells the backend to build a field-user reset link so the
    // web reset page shows the guard-app variant, not the tenant marketing page.
    return api.post(
      "/auth/send-password-reset-email",
      { email, app: "worker" },
      { skipAuth: true }
    );
  },

  /** Set a new password from a reset token (deep-linked from email/push). */
  resetPassword(token: string, password: string): Promise<void> {
    return api.put(
      "/auth/password-reset",
      { token, password },
      { skipAuth: true }
    );
  },
};
