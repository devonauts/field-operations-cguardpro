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
    return api.post<AuthPayload>("/auth/sign-in", credentials, {
      skipAuth: true,
    });
  },

  getProfile(): Promise<any> {
    return api.get("/auth/me");
  },

  sendPasswordResetEmail(email: string): Promise<void> {
    return api.post(
      "/auth/send-password-reset-email",
      { email },
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
