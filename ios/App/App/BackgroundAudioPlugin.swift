import Foundation
import Capacitor
import AVFoundation

/**
 * BackgroundAudio — keeps the iOS app alive while the live radio (Canal abierto)
 * is connected, so half-duplex PTT keeps RECEIVING and TRANSMITTING when the
 * guard switches to another app or locks the screen.
 *
 * Why this is needed: the radio audio is rendered by the WKWebView's Web Audio
 * graph. iOS suspends a backgrounded WebView (timers + audio frozen, the socket
 * eventually drops) UNLESS the process is actively playing audio through an
 * active AVAudioSession with the `audio` UIBackgroundMode (declared in
 * Info.plist). A near-silent WebAudio loop is not enough — the WebView itself is
 * what gets suspended. So we render a continuous silent buffer NATIVELY here: as
 * long as this engine is playing, iOS keeps the whole app (WebView included)
 * running in the background, which keeps the socket + Web Audio receive path live.
 *
 * Lifecycle is owned by the JS side (RadioContext): start() when the channel
 * connects (on duty), stop() when it disconnects (off duty) to release the mic
 * and stop draining the battery.
 *
 * Capacitor 6 auto-registers this because it conforms to CAPBridgedPlugin and is
 * exposed to the Obj-C runtime via @objc — no .m registration file required.
 */
@objc(BackgroundAudioPlugin)
public class BackgroundAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BackgroundAudioPlugin"
    public let jsName = "BackgroundAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var running = false

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.beginKeepAlive()
            call.resolve(["running": self.running])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.endKeepAlive()
            call.resolve(["running": self.running])
        }
    }

    /// playAndRecord + voiceChat tunes the half-duplex PTT path; Bluetooth options
    /// let BT headsets / PTT buttons work; mixWithOthers keeps music playing.
    private func configureSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP, .mixWithOthers]
            )
            try session.setActive(true, options: [])
        } catch {
            CAPLog.print("[bgaudio] session config failed: \(error)")
        }
    }

    private func beginKeepAlive() {
        if running { return }
        configureSession()

        NotificationCenter.default.addObserver(
            self, selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification, object: nil)

        guard let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1) else { return }
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)

        // 1s of silence, looped forever — keeps the output graph rendering so iOS
        // treats us as "playing audio" and does not suspend the process.
        let frames = AVAudioFrameCount(44100)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return }
        buffer.frameLength = frames
        if let ch = buffer.floatChannelData {
            memset(ch[0], 0, Int(frames) * MemoryLayout<Float>.size)
        }

        do {
            try engine.start()
            player.scheduleBuffer(buffer, at: nil, options: .loops, completionHandler: nil)
            player.play()
            running = true
        } catch {
            CAPLog.print("[bgaudio] engine start failed: \(error)")
        }
    }

    private func endKeepAlive() {
        NotificationCenter.default.removeObserver(self, name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
        if player.isPlaying { player.stop() }
        if engine.isRunning { engine.stop() }
        engine.reset()
        running = false
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    /// After a phone call / Siri interruption ends, re-activate and resume playback
    /// so background audio (and thus the radio) recovers without user action.
    @objc private func handleInterruption(_ note: Notification) {
        guard running,
              let info = note.userInfo,
              let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .ended {
            configureSession()
            if !engine.isRunning { try? engine.start() }
            if !player.isPlaying { player.play() }
        }
    }

    /// Headphones unplugged / BT device change can stop the graph — restart it.
    @objc private func handleRouteChange(_ note: Notification) {
        guard running else { return }
        configureSession()
        if !engine.isRunning { try? engine.start() }
        if !player.isPlaying { player.play() }
    }
}
