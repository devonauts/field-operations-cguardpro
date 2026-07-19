# App Review — Guideline 2.5.4 (`UIBackgroundModes: audio`)

**Decision: KEEP `audio` and defend it.** The live security radio (LiveKit/WebRTC)
plays dispatcher/supervisor voice while the app is backgrounded or the screen is
locked during a shift — squarely within 2.5.4's allowance for "audible content
to the user while in the background … streaming audio". Removing it would cut
guards off from dispatch (safety-critical). `location` (shift tracking) and
`remote-notification` (dispatch pushes) are also feature-backed.

The July 2026 rejection was a **discoverability failure**: the radio requires a
guard account that can clock in, and had no visible entry point (only the
unlabeled floating PTT button and push deep-links). A "Radio" row now exists on
the on-duty home (`OnDutyView.tsx`).

## Checklist before resubmitting

- [ ] **Demo/review account**: guard role, permanently assigned demo station,
      `canClockIn` always true, 24/7 clock-in window, no geofence rejection,
      selfie step accepts any photo. Target: login → on duty in < 1 minute.
- [ ] **Audible demo channel**: the AI dispatcher ("pase de novedades") firing
      every ~2 minutes on the demo tenant, or a bot/live supervisor
      transmitting. If the reviewer locks the phone and hears silence, the
      defense collapses.
- [ ] **Demo video** (< 90 s, one take, physical iPhone): login → clock-in →
      radio screen with roster → incoming voice audibly plays → lock the phone →
      voice continues over the lock screen (system audio indicator visible) →
      unlock, hold PTT and reply. Attach in Resolution Center + link in Notes.
- [ ] Fill the placeholders below and send the English reply.

## Resolution Center reply (send this — English)

> **Re: Guideline 2.5.4 — UIBackgroundModes "audio"**
>
> Thank you for the review. We respectfully ask you to reconsider: the app does
> contain a core feature that requires persistent background audio, and we
> believe it falls under the use Guideline 2.5.4 explicitly permits — "apps that
> provide audible content to the user while in the background, such as …
> streaming audio."
>
> **The feature.** CGuardPro is an operations app for professional security
> guards. While a guard is clocked in ("on duty"), the app maintains a live
> security-radio channel — a walkie-talkie — streaming real-time voice
> (WebRTC/Opus over our LiveKit media server). Supervisors and dispatch call
> guards on this channel at any moment, including emergencies. Guards carry the
> phone in a pocket or with the screen locked for entire shifts; incoming voice
> from dispatch must remain audible while the app is in the background or the
> device is locked. This live voice stream is genuine audible content played to
> the user in the background — it is the sole reason the "audio" background mode
> is declared. Without it, iOS suspends the app on backgrounding and the guard
> is cut off from dispatch, which is a safety problem in this industry.
>
> **How to experience it (demo account):**
> Username: `[DEMO_GUARD_EMAIL]` — Password: `[DEMO_PASSWORD]`
> 1. Log in with the demo guard account.
> 2. On the home screen, tap the gold "Marcar entrada" (Clock in) button and
>    complete the short start-of-shift flow (any selfie photo is accepted for
>    the demo account). You are now "on duty."
> 3. The radio connects automatically: a floating gold microphone button appears
>    (hold it to talk on the channel), and the full radio screen is available at
>    Home → Radio.
> 4. Within ~2 minutes you will hear live audio on the channel: our demo
>    dispatcher transmits periodically [and/or: we will have a live dispatcher
>    transmitting during your review — we are happy to coordinate a time].
> 5. To verify the background behavior: while on the radio screen, lock the
>    device or switch to another app. The dispatcher's voice keeps playing —
>    this is the persistent background audio the entitlement enables.
>
> We have also attached a short video showing the radio playing dispatcher audio
> with the device locked.
>
> The other declared modes are likewise feature-backed: "location" powers live
> guard tracking / patrol trails during shifts (with the required
> NSLocationAlwaysAndWhenInUse description), and "remote-notification" powers
> dispatch pushes (roll-call requests, incidents) that must be processed on
> arrival.
>
> Please let us know if you need anything else — we can provide additional
> credentials or a live walkthrough.

## Respuesta (referencia — español)

> **Ref.: Pauta 2.5.4 — UIBackgroundModes "audio"**
>
> Gracias por la revisión. Respetuosamente pedimos que se reconsidere: la app sí
> incluye una función central que requiere audio persistente en segundo plano, y
> consideramos que corresponde al uso que la Pauta 2.5.4 permite expresamente —
> "apps que proporcionan contenido audible al usuario mientras están en segundo
> plano, como … audio en streaming."
>
> **La función.** CGuardPro es una app operativa para guardias de seguridad
> profesionales. Mientras el guardia está en turno, la app mantiene un canal de
> radio de seguridad en vivo — un walkie-talkie — que transmite voz en tiempo
> real (WebRTC/Opus sobre nuestro servidor LiveKit). Los supervisores y la
> central llaman a los guardias por este canal en cualquier momento, incluidas
> emergencias. El guardia lleva el teléfono en el bolsillo o con la pantalla
> bloqueada durante todo el turno; la voz entrante de la central debe seguir
> escuchándose con la app en segundo plano o el dispositivo bloqueado. Ese flujo
> de voz en vivo es contenido audible real reproducido al usuario en segundo
> plano — es la única razón por la que se declara el modo "audio". Sin él, iOS
> suspende la app al pasar a segundo plano y el guardia queda incomunicado con
> la central, lo cual es un problema de seguridad en esta industria.
>
> **Cómo comprobarlo (cuenta de demostración):**
> Usuario: `[DEMO_GUARD_EMAIL]` — Contraseña: `[DEMO_PASSWORD]`
> 1. Inicie sesión con la cuenta de guardia de demostración.
> 2. En la pantalla de inicio, toque el botón dorado "Marcar entrada" y complete
>    el breve flujo de inicio de turno (la cuenta demo acepta cualquier selfie).
>    Ya está "en servicio".
> 3. La radio se conecta automáticamente: aparece un botón flotante dorado de
>    micrófono (manténgalo presionado para hablar) y la pantalla completa de
>    radio está en Inicio → Radio.
> 4. En ~2 minutos escuchará audio en vivo en el canal: nuestra central de
>    demostración transmite periódicamente.
> 5. Para verificar el comportamiento en segundo plano: con la radio abierta,
>    bloquee el dispositivo o cambie a otra app. La voz de la central sigue
>    reproduciéndose.
>
> Adjuntamos también un video breve que muestra la radio reproduciendo audio de
> la central con el dispositivo bloqueado.
>
> Los demás modos declarados también corresponden a funciones reales:
> "location" (seguimiento en vivo en turno) y "remote-notification" (avisos de
> la central).

## Notes for Review (App Store Connect)

> DEMO ACCOUNT (guard): [email] / [password]
> The app's key feature is a live security-radio (walkie-talkie) that streams
> dispatcher voice in the background — this is why UIBackgroundModes includes
> "audio".
> Steps: Log in → tap "Marcar entrada" (Clock in) on the home screen → complete
> the short start-shift flow (any selfie works on this demo account) → you are
> on duty and the radio channel auto-connects (floating gold mic button =
> push-to-talk; full screen under Home → Radio). Our demo dispatcher transmits
> voice on the channel every ~2 minutes. Lock the screen or background the app:
> the voice keeps playing.
> "location" = live guard tracking during shifts (background geolocation).
> "remote-notification" = dispatch pushes (roll calls, incidents).
> Contact for a live radio walkthrough: [phone/email, timezone].

## If Apple pushes back again

Mention that adopting the iOS 16+ **Push to Talk framework** is on the roadmap
(system PTT UI, `pushtotalk` APNs). It is a multi-week migration for a
Capacitor/WebRTC app (native `PTChannelManager` plugin, APNs bridge per talk
burst, audio-session handoff with LiveKit), so it is planned evolution, not a
prerequisite. "voip" + CallKit is the wrong model for an always-open monitored
channel (it would ring a full-screen call per transmission).
