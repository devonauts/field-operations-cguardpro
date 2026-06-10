/**
 * Ensure the OS microphone permission before capturing audio. On native,
 * Capacitor's WebView does NOT request Android's RECORD_AUDIO runtime permission
 * for getUserMedia, so we request it explicitly via capacitor-voice-recorder.
 * On web/dev the plugin import throws and getUserMedia prompts on its own, so we
 * optimistically return true.
 */
export async function ensureMicPermission(): Promise<boolean> {
  try {
    const { VoiceRecorder } = await import("capacitor-voice-recorder");
    const has = await VoiceRecorder.hasAudioRecordingPermission();
    if (has.value) return true;
    const req = await VoiceRecorder.requestAudioRecordingPermission();
    return !!req.value;
  } catch {
    return true; // web fallback — getUserMedia will surface its own prompt/denial
  }
}
