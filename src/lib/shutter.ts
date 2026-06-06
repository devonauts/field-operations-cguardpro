// A synthesized camera-shutter click — two short filtered noise bursts played
// through the Web Audio API, so we ship no audio asset and add no dependency.
// Deliberately resilient: any failure (browser autoplay policy, no AudioContext,
// suspended context) is swallowed. The sound is a nicety; clocking in must never
// depend on it.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // Mobile WebViews start the context suspended until a user gesture — the
    // shutter tap counts, so resume() here lands inside that gesture.
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// One mechanical "snap": a brief noise burst with a fast cubic decay, high-passed
// so it sounds like a crisp click rather than a thud.
function click(ac: AudioContext, at: number, gain: number, dur: number) {
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const env = Math.pow(1 - i / n, 3);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1600;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(hp).connect(g).connect(ac.destination);
  src.start(at);
  src.stop(at + dur);
}

// Two clicks ~90ms apart mimic an SLR mirror flip + shutter close.
export function playShutter() {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  click(ac, t0, 0.6, 0.04);
  click(ac, t0 + 0.09, 0.4, 0.06);
}

// One clean sine tone with a quick attack and exponential decay.
function tone(ac: AudioContext, freq: number, at: number, dur: number, gain: number) {
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur);
}

// An ascending two-note chime confirming the clock-in went through — played
// while the stamped selfie is still on screen. Same best-effort contract as the
// shutter: never blocks or fails the clock-in.
export function playSuccess() {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  tone(ac, 880, t0, 0.18, 0.25); // A5
  tone(ac, 1318.5, t0 + 0.12, 0.3, 0.22); // E6
}
