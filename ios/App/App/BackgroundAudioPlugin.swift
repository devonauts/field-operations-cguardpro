import Foundation
import Capacitor

/**
 * BackgroundAudio — NO-OP on iOS (kept only so the shared JS bridge
 * `backgroundAudio.ts` has a plugin to call; the Android implementation still
 * runs the microphone foreground service).
 *
 * WHY IT DOES NOTHING NOW: the radio runs on LiveKit (WebRTC in the WKWebView),
 * which manages its OWN AVAudioSession and keeps it continuously active while the
 * channel is connected — that (plus the `audio` UIBackgroundMode in Info.plist)
 * is what keeps audio flowing when the app is backgrounded/locked.
 *
 * The OLD implementation configured its own AVAudioSession
 * (.playAndRecord/.voiceChat/.mixWithOthers) AND ran a separate AVAudioEngine
 * looping a SILENT buffer to stay "playing." Against LiveKit that backfired: the
 * competing engine took over the output route in the background and played its
 * SILENCE instead of the radio — so the worker heard nothing backgrounded while
 * the supervisor app (which does NO native audio manipulation at all) received
 * fine. Letting LiveKit fully own the session matches the supervisor and fixes it.
 *
 * If a dedicated keep-alive is ever needed again, it must NOT touch the session
 * category or render audio — LiveKit owns both.
 */
@objc(BackgroundAudioPlugin)
public class BackgroundAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BackgroundAudioPlugin"
    public let jsName = "BackgroundAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    @objc func start(_ call: CAPPluginCall) {
        // LiveKit owns the audio session — do not touch it.
        call.resolve(["running": true])
    }

    @objc func stop(_ call: CAPPluginCall) {
        call.resolve(["running": false])
    }
}
