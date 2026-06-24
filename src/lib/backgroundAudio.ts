import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Bridge to the native BackgroundAudio plugin (iOS: BackgroundAudioPlugin.swift;
 * Android: relies on the foreground audio session). While running, it renders a
 * silent audio loop natively so iOS does NOT suspend the app when backgrounded —
 * keeping the live radio (socket + Web Audio receive) alive across app switches
 * and screen lock. No-op on web.
 */
interface BackgroundAudioPlugin {
  start(): Promise<{ running: boolean }>;
  stop(): Promise<{ running: boolean }>;
}

const Native = registerPlugin<BackgroundAudioPlugin>("BackgroundAudio");

/** Begin the native keep-alive. Call when the radio channel connects (on duty). */
export async function startBackgroundAudio(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Native.start();
  } catch (e) {
    // Plugin missing (web / not yet synced into native) — degrade gracefully.
    console.warn("backgroundAudio.start skipped", e);
  }
}

/** Stop the native keep-alive. Call when the channel disconnects (off duty). */
export async function stopBackgroundAudio(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Native.stop();
  } catch (e) {
    console.warn("backgroundAudio.stop skipped", e);
  }
}
