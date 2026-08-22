// The beach jukebox. Two kinds of tracks:
//  - "chip": original tiny chiptunes generated with WebAudio oscillators
//  - "file": CC0 lo-fi tracks from Open Lo-Fi (public domain), vendored in
//    public/assets/audio (see public/assets/ATTRIBUTION.md)
//
// Guarantees: starts MUTED, plays only after an explicit user toggle, and
// EXACTLY ONE track plays at a time. Every start goes through stopEverything
// first, and chip voices hang off per-voice gain buses that are disconnected
// immediately on stop, so nothing can overlap or double-loop.

interface ChipTrack {
  kind: "chip";
  name: string;
  bpm: number;
  lead: Array<[number | null, number]>; // [semitones from C4 | rest, beats]
  bass: Array<[number | null, number]>;
  leadType: OscillatorType;
  bassType: OscillatorType;
}

interface FileTrack {
  kind: "file";
  name: string;
  url: string;
}

type Track = ChipTrack | FileTrack;

const TRACKS: Track[] = [
  {
    kind: "chip",
    name: "SUNNY LOOP",
    bpm: 92,
    leadType: "square",
    bassType: "triangle",
    lead: [
      [0, 1],
      [4, 1],
      [7, 1],
      [4, 1],
      [9, 1.5],
      [7, 0.5],
      [4, 1],
      [null, 1],
      [0, 1],
      [4, 1],
      [7, 1],
      [12, 1],
      [9, 1.5],
      [7, 0.5],
      [4, 1],
      [null, 1],
      [5, 1],
      [9, 1],
      [12, 1],
      [9, 1],
      [7, 1.5],
      [4, 0.5],
      [0, 1],
      [null, 1],
      [5, 1],
      [4, 1],
      [2, 1],
      [4, 1],
      [0, 2],
      [null, 2],
    ],
    bass: [
      [-24, 2],
      [-17, 2],
      [-24, 2],
      [-17, 2],
      [-24, 2],
      [-17, 2],
      [-24, 2],
      [-17, 2],
      [-19, 2],
      [-12, 2],
      [-24, 2],
      [-17, 2],
      [-19, 2],
      [-20, 2],
      [-24, 4],
    ],
  },
  {
    kind: "chip",
    name: "CRUNCH TIME",
    bpm: 118,
    leadType: "square",
    bassType: "sawtooth",
    lead: [
      [-3, 0.5],
      [0, 0.5],
      [2, 0.5],
      [4, 0.5],
      [5, 1],
      [4, 0.5],
      [2, 0.5],
      [0, 1],
      [-1, 1],
      [-3, 2],
      [-3, 0.5],
      [0, 0.5],
      [2, 0.5],
      [4, 0.5],
      [7, 1],
      [5, 0.5],
      [4, 0.5],
      [2, 1],
      [4, 1],
      [5, 2],
      [4, 0.5],
      [5, 0.5],
      [7, 0.5],
      [9, 0.5],
      [7, 1],
      [5, 0.5],
      [4, 0.5],
      [2, 1],
      [0, 1],
      [-1, 2],
      [0, 0.5],
      [-1, 0.5],
      [-3, 1],
      [null, 0.5],
      [-3, 0.5],
      [-1, 0.5],
      [0, 0.5],
      [-3, 2],
      [null, 2],
    ],
    bass: [
      [-27, 1],
      [-27, 1],
      [-20, 1],
      [-27, 1],
      [-22, 1],
      [-22, 1],
      [-15, 1],
      [-22, 1],
      [-24, 1],
      [-24, 1],
      [-17, 1],
      [-24, 1],
      [-26, 1],
      [-26, 1],
      [-20, 1],
      [-19, 1],
      [-27, 1],
      [-27, 1],
      [-20, 1],
      [-27, 1],
      [-22, 1],
      [-22, 1],
      [-15, 1],
      [-22, 1],
      [-24, 1],
      [-24, 1],
      [-17, 1],
      [-24, 1],
      [-26, 2],
      [-27, 2],
    ],
  },
  {
    kind: "file",
    name: "TIDE POOLS",
    url: "/assets/audio/tide-pools-at-twilight.mp3",
  },
  {
    kind: "file",
    name: "SUNSET OFFBEAT",
    url: "/assets/audio/sunset-offbeat.mp3",
  },
  {
    kind: "file",
    name: "GOLDEN AFTERNOON",
    url: "/assets/audio/golden-afternoon-groove.mp3",
  },
  {
    kind: "file",
    name: "BURNT SUNSET",
    url: "/assets/audio/burnt-sunset-groove.mp3",
  },
  {
    kind: "file",
    name: "BLUE BELOW",
    url: "/assets/audio/blue-below-the-surface.mp3",
  },
  {
    kind: "file",
    name: "TIDE POLAROIDS",
    url: "/assets/audio/tide-stained-polaroids.mp3",
  },
  {
    kind: "file",
    name: "PORCHLIGHT",
    url: "/assets/audio/porchlight-golden-hour.mp3",
  },
  {
    kind: "chip",
    name: "LOW TIDE",
    bpm: 70,
    leadType: "triangle",
    bassType: "sine",
    lead: [
      [0, 1.5],
      [4, 1.5],
      [7, 3],
      [5, 1.5],
      [4, 1.5],
      [2, 3],
      [0, 1.5],
      [2, 1.5],
      [4, 3],
      [2, 1.5],
      [0, 1.5],
      [-5, 3],
      [0, 1.5],
      [4, 1.5],
      [9, 3],
      [7, 1.5],
      [5, 1.5],
      [4, 3],
      [2, 1.5],
      [4, 1.5],
      [0, 3],
      [null, 3],
      [null, 3],
    ],
    bass: [
      [-24, 3],
      [-19, 3],
      [-17, 3],
      [-12, 3],
      [-24, 3],
      [-19, 3],
      [-17, 3],
      [-24, 3],
      [-24, 3],
      [-15, 3],
      [-17, 3],
      [-12, 3],
      [-17, 3],
      [-19, 3],
      [-24, 6],
    ],
  },
  {
    kind: "chip",
    name: "OFFICE PARTY",
    bpm: 128,
    leadType: "square",
    bassType: "triangle",
    lead: [
      [0, 0.5],
      [0, 0.5],
      [7, 0.5],
      [7, 0.5],
      [9, 0.5],
      [9, 0.5],
      [7, 1],
      [5, 0.5],
      [5, 0.5],
      [4, 0.5],
      [4, 0.5],
      [2, 0.5],
      [2, 0.5],
      [0, 1],
      [7, 0.5],
      [7, 0.5],
      [5, 0.5],
      [5, 0.5],
      [4, 0.5],
      [4, 0.5],
      [2, 1],
      [0, 0.5],
      [0, 0.5],
      [7, 0.5],
      [7, 0.5],
      [9, 0.5],
      [9, 0.5],
      [7, 1],
      [5, 0.5],
      [5, 0.5],
      [4, 0.5],
      [4, 0.5],
      [2, 0.5],
      [2, 0.5],
      [0, 1],
      [null, 1],
      [4, 0.5],
      [7, 0.5],
      [12, 1],
      [null, 1],
    ],
    bass: [
      [-24, 1],
      [-12, 1],
      [-24, 1],
      [-12, 1],
      [-17, 1],
      [-5, 1],
      [-17, 1],
      [-5, 1],
      [-19, 1],
      [-7, 1],
      [-19, 1],
      [-7, 1],
      [-17, 1],
      [-5, 1],
      [-17, 1],
      [-5, 1],
      [-24, 2],
      [-24, 2],
    ],
  },
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let playing = false;
let trackIndex = 0;
/** Bumped on every start/stop; async callbacks bail if it moved on. */
let session = 0;

/** Chip voice teardown handles (timer + gain bus per voice). */
let voiceStops: Array<() => void> = [];
/** One shared element for file tracks: one at a time by construction. */
let fileAudio: HTMLAudioElement | null = null;

function freq(semi: number): number {
  return 261.63 * Math.pow(2, semi / 12);
}

function scheduleVoice(
  audio: AudioContext,
  out: GainNode,
  notes: Array<[number | null, number]>,
  type: OscillatorType,
  gain: number,
  bpm: number,
  mySession: number,
): () => void {
  const beat = 60 / bpm;
  const loopBeats = notes.reduce((s, [, b]) => s + b, 0);
  // Per-voice bus: disconnecting it silences every scheduled oscillator
  // instantly, so a stopped track can never keep looping underneath.
  const bus = audio.createGain();
  bus.connect(out);
  let nextLoopStart = audio.currentTime + 0.05;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleLoop = () => {
    if (mySession !== session) return;
    let t = nextLoopStart;
    for (const [semi, beats] of notes) {
      const dur = beats * beat;
      if (semi !== null) {
        const osc = audio.createOscillator();
        const env = audio.createGain();
        osc.type = type;
        osc.frequency.value = freq(semi);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(gain, t + 0.02);
        env.gain.setValueAtTime(gain, t + dur * 0.6);
        env.gain.linearRampToValueAtTime(0, t + dur * 0.9);
        osc.connect(env).connect(bus);
        osc.start(t);
        osc.stop(t + dur);
      }
      t += dur;
    }
    nextLoopStart += loopBeats * beat;
    timer = setTimeout(
      scheduleLoop,
      (nextLoopStart - audio.currentTime - 0.5) * 1000,
    );
  };
  scheduleLoop();
  return () => {
    if (timer) clearTimeout(timer);
    bus.disconnect();
  };
}

function startSurf(audio: AudioContext, out: GainNode): () => void {
  const bufferSize = audio.sampleRate * 2;
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02; // brown-ish noise
    data[i] = last * 3.5;
  }
  const bus = audio.createGain();
  bus.connect(out);
  const src = audio.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  const surfGain = audio.createGain();
  surfGain.gain.value = 0.12;
  const lfo = audio.createOscillator();
  lfo.frequency.value = 0.11; // slow wave swell
  const lfoGain = audio.createGain();
  lfoGain.gain.value = 0.07;
  lfo.connect(lfoGain).connect(surfGain.gain);
  src.connect(filter).connect(surfGain).connect(bus);
  src.start();
  lfo.start();
  return () => {
    src.stop();
    lfo.stop();
    bus.disconnect();
  };
}

/** Hard stop of everything that could make sound. */
function stopEverything() {
  session++;
  for (const stop of voiceStops) stop();
  voiceStops = [];
  if (fileAudio) {
    fileAudio.pause();
    fileAudio.src = "";
    fileAudio = null;
  }
}

async function startCurrent(): Promise<void> {
  stopEverything();
  const mySession = session;
  const track = TRACKS[trackIndex]!;
  if (track.kind === "file") {
    const el = new Audio(track.url);
    el.loop = true;
    el.volume = 0.55;
    fileAudio = el;
    try {
      await el.play();
    } catch {
      // Autoplay refusal or a missing file: stay silent, keep state honest.
      if (mySession === session) playing = false;
    }
    return;
  }
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  await ctx.resume();
  if (mySession !== session) return;
  master!.gain.cancelScheduledValues(ctx.currentTime);
  master!.gain.setValueAtTime(0, ctx.currentTime);
  master!.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.3);
  voiceStops.push(
    scheduleVoice(
      ctx,
      master!,
      track.lead,
      track.leadType,
      0.05,
      track.bpm,
      mySession,
    ),
    scheduleVoice(
      ctx,
      master!,
      track.bass,
      track.bassType,
      0.08,
      track.bpm,
      mySession,
    ),
    startSurf(ctx, master!),
  );
}

export function isSoundOn(): boolean {
  return playing;
}

export function trackName(): string {
  return TRACKS[trackIndex]!.name;
}

export function trackCount(): number {
  return TRACKS.length;
}

export function currentTrack(): number {
  return trackIndex;
}

export function setTrack(index: number) {
  trackIndex =
    ((Math.round(index) % TRACKS.length) + TRACKS.length) % TRACKS.length;
}

/** Switch tracks; if playing, the previous one stops before the next starts. */
export function changeTrack(dir: 1 | -1): string {
  trackIndex = (trackIndex + dir + TRACKS.length) % TRACKS.length;
  if (playing) void startCurrent();
  return trackName();
}

export async function setSound(on: boolean): Promise<void> {
  if (on === playing) return;
  if (!on) {
    playing = false;
    stopEverything();
    await ctx?.suspend().catch(() => {});
    return;
  }
  playing = true;
  try {
    await startCurrent();
  } catch {
    playing = false;
    stopEverything();
  }
}
