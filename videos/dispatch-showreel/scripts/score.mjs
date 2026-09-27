// Dispatch showreel score — synthesized offline, deterministically, to the edit.
// 120 BPM (beat = 0.5s). Every cut in index.html lands on this grid.
// Usage: node scripts/score.mjs  →  assets/audio/score.wav
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOUD_TRIM = Number(process.env.LOUD_TRIM ?? 1.0);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SR = 48000;
const DUR = 15;
const N = SR * DUR;
const TAU = Math.PI * 2;

// ── Buses ────────────────────────────────────────────────────────────────────
const bus = () => [new Float32Array(N), new Float32Array(N)];
const DRUMS = bus();
const BASS = bus(); // sidechained
const PADS = bus(); // sidechained
const KEYS = bus();
const FX = bus();
const SEND = bus(); // → reverb
const SFX = bus();

// Seeded PRNG (mulberry32) — same noise every render.
let seed = 0x5eed1234;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const noise = () => rnd() * 2 - 1;

function put(b, i, v, pan = 0) {
  if (i < 0 || i >= N) return;
  const l = Math.cos(((pan + 1) * Math.PI) / 4);
  const r = Math.sin(((pan + 1) * Math.PI) / 4);
  b[0][i] += v * l * Math.SQRT2;
  b[1][i] += v * r * Math.SQRT2;
}

// RBJ biquad with per-sample-settable coefficients.
function biquad(type, f, q) {
  const s = { x1: 0, x2: 0, y1: 0, y2: 0, b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 };
  s.set = (freq, Q = q) => {
    const w = (TAU * Math.min(freq, SR * 0.45)) / SR;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * Q);
    let b0, b1, b2;
    if (type === "lp") [b0, b1, b2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2];
    else if (type === "hp") [b0, b1, b2] = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha];
    const a0 = 1 + alpha;
    s.b0 = b0 / a0;
    s.b1 = b1 / a0;
    s.b2 = b2 / a0;
    s.a1 = (-2 * cw) / a0;
    s.a2 = (1 - alpha) / a0;
  };
  s.run = (x) => {
    const y = s.b0 * x + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2;
    s.x2 = s.x1;
    s.x1 = x;
    s.y2 = s.y1;
    s.y1 = y;
    return y;
  };
  s.set(f, q);
  return s;
}

const hz = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz
const at = (t) => Math.round(t * SR);

// ── Instruments ──────────────────────────────────────────────────────────────
function kick(t0, g = 1) {
  const i0 = at(t0);
  let ph = 0;
  for (let i = 0; i < at(0.5); i++) {
    const t = i / SR;
    const f = 46 + 120 * Math.exp(-t * 32);
    ph += (TAU * f) / SR;
    let v = Math.sin(ph) * Math.exp(-t * 6.2);
    v += noise() * Math.exp(-t * 420) * 0.35;
    put(DRUMS, i0 + i, Math.tanh(v * 1.6) * 0.62 * g);
  }
}
function clap(t0, g = 1, pan = 0) {
  const i0 = at(t0);
  const bp = biquad("bp", 1250, 1.1);
  for (let i = 0; i < at(0.4); i++) {
    const t = i / SR;
    let env = 0;
    for (const o of [0, 0.011, 0.023]) if (t >= o) env = Math.max(env, Math.exp(-(t - o) * 260));
    if (t >= 0.03) env = Math.max(env, 0.55 * Math.exp(-(t - 0.03) * 16));
    const v = bp.run(noise()) * env * 1.5 * g;
    put(DRUMS, i0 + i, v, pan);
    put(SEND, i0 + i, v * 0.35, pan);
  }
}
function hat(t0, g = 1, open = false, pan = 0) {
  const i0 = at(t0);
  const hp = biquad("hp", open ? 6500 : 8000, 0.8);
  const len = open ? 0.26 : 0.06;
  for (let i = 0; i < at(len); i++) {
    const t = i / SR;
    const v = hp.run(noise()) * Math.exp(-t * (open ? 13 : 75)) * 0.28 * g;
    put(DRUMS, i0 + i, v, pan);
  }
}
function sub(t0, dur, f, g = 1) {
  const i0 = at(t0);
  let ph = 0;
  for (let i = 0; i < at(dur + 0.04); i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.006) * (t > dur ? Math.exp(-(t - dur) * 90) : 1);
    ph += (TAU * f) / SR;
    const v = (Math.sin(ph) + 0.28 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph)) * env * 0.36 * g;
    put(BASS, i0 + i, Math.tanh(v * 1.4));
  }
}
// Additive "analog" pad: band-limited saw per voice, spectrally low-passed (alias-free).
function pad(t0, dur, notes, g = 1, { fc = 1800, attack = 0.28, release = 0.5, send = 0.5 } = {}) {
  const i0 = at(t0);
  const total = at(dur + release);
  const voices = [];
  notes.forEach((n, k) => {
    [-7, 0, 7].forEach((cents, v) => {
      const f = hz(n) * Math.pow(2, cents / 1200);
      const H = Math.max(1, Math.min(14, Math.floor(9000 / f)));
      const amps = [];
      for (let h = 1; h <= H; h++) amps.push(1 / h / Math.sqrt(1 + Math.pow((h * f) / fc, 2)));
      voices.push({ f, amps, pan: (v - 1) * 0.55 + (k % 2 ? 0.1 : -0.1), ph: rnd() * TAU });
    });
  });
  const norm = 0.11 / Math.sqrt(voices.length);
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    const env = Math.min(1, t / attack) * (t > dur ? Math.exp(-(t - dur) * (4 / release)) : 1);
    if (env < 1e-4 && t > dur) break;
    for (const vo of voices) {
      const base = vo.ph + (TAU * vo.f * i) / SR;
      let s = 0;
      for (let h = 0; h < vo.amps.length; h++) s += vo.amps[h] * Math.sin((h + 1) * base);
      const v = s * env * norm * g;
      put(PADS, i0 + i, v, vo.pan);
      put(SEND, i0 + i, v * send, vo.pan);
    }
  }
}
function pluck(t0, note, g = 1, pan = 0, { decay = 7, send = 0.45, bright = 1 } = {}) {
  const i0 = at(t0);
  const f = hz(note);
  const H = Math.max(1, Math.min(10, Math.floor(10000 / f)));
  for (let i = 0; i < at(0.9); i++) {
    const t = i / SR;
    let s = 0;
    for (let h = 1; h <= H; h++) s += (Math.pow(bright, h - 1) / h) * Math.exp(-t * decay * (1 + 0.45 * h)) * Math.sin((TAU * f * h * i) / SR);
    const v = s * Math.min(1, t / 0.002) * 0.16 * g;
    put(KEYS, i0 + i, v, pan);
    put(SEND, i0 + i, v * send, pan);
  }
}
function stab(t0, notes, g = 1) {
  notes.forEach((n, k) => pluck(t0, n, 0.9 * g, (k - 1) * 0.35, { decay: 5, send: 0.7, bright: 0.85 }));
  kick(t0, 0.45 * g);
  const i0 = at(t0);
  const hp = biquad("hp", 3000, 0.7);
  for (let i = 0; i < at(0.08); i++) put(FX, i0 + i, hp.run(noise()) * Math.exp(-(i / SR) * 60) * 0.25 * g);
}
function riser(t0, t1, g = 1, { f0 = 280, f1 = 7200 } = {}) {
  const i0 = at(t0);
  const len = at(t1 - t0);
  const bp = biquad("bp", f0, 2.2);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len;
    if (i % 32 === 0) bp.set(f0 * Math.pow(f1 / f0, p), 2.2);
    ph += (TAU * (180 + 900 * p * p)) / SR;
    const amp = Math.pow(p, 2.2);
    const v = (bp.run(noise()) * 1.4 + Math.sin(ph) * 0.12) * amp * 0.5 * g;
    put(FX, i0 + i, v, Math.sin(p * 9) * 0.3);
    put(SEND, i0 + i, v * 0.2);
  }
}
function swell(t0, t1, g = 1) {
  const i0 = at(t0);
  const len = at(t1 - t0);
  const hp = biquad("hp", 4500, 0.7);
  for (let i = 0; i < len; i++) {
    const p = i / len;
    put(FX, i0 + i, hp.run(noise()) * Math.pow(p, 3) * 0.55 * g, (rnd() - 0.5) * 0.4);
  }
}

// ── SFX samples (bundled Pixabay library, copied to assets/sfx) ──────────────
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", join(ROOT, "assets/sfx", `${name}.mp3`), "-f", "f32le", "-ac", "2", "-ar", String(SR), "-"], {
    maxBuffer: 1 << 28,
  });
  const f = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const n = f.length / 2;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  let peakI = 0;
  let peakV = 0;
  for (let i = 0; i < n; i++) {
    l[i] = f[2 * i];
    r[i] = f[2 * i + 1];
    const e = Math.abs(l[i]) + Math.abs(r[i]);
    if (e > peakV) {
      peakV = e;
      peakI = i;
    }
  }
  const s = { l, r, n, peakI };
  cache.set(name, s);
  return s;
}
// align "onset": sample start lands on t. align "peak": the loudest moment lands on t.
function sfx(name, t, g = 1, { align = "onset", max = Infinity, fade = 0.08, pan = 0 } = {}) {
  const s = load(name);
  const start = at(t) - (align === "peak" ? s.peakI : 0);
  const len = Math.min(s.n, at(max));
  const fadeN = at(fade);
  const pl = Math.min(1, 1 - pan);
  const pr = Math.min(1, 1 + pan);
  for (let i = 0; i < len; i++) {
    const j = start + i;
    if (j < 0 || j >= N) continue;
    const fo = len < s.n && i > len - fadeN ? (len - i) / fadeN : 1;
    SFX[0][j] += s.l[i] * g * fo * pl;
    SFX[1][j] += s.r[i] * g * fo * pr;
  }
}

// ── ARRANGEMENT ──────────────────────────────────────────────────────────────
// 01 NOISE (0 – 2.3): drone, ticking hats, the three hook stabs, a riser — then a hole.
pad(0, 2.25, [33, 40, 45], 0.9, { fc: 700, attack: 0.9, release: 0.08, send: 0.3 });
for (let k = 0; k * 0.125 < 2.25; k++) hat(k * 0.125, 0.25 + 0.75 * (k / 18), false, k % 2 ? 0.25 : -0.25);
[0.25, 0.75, 1.25].forEach((t, k) => stab(t, [[57, 60, 64], [57, 60, 65], [57, 62, 65]][k], 1));
riser(1.1, 2.3, 0.9);
[1.5, 1.75, 2.0].forEach((t) => kick(t, 0.5));
kick(2.125, 0.45);
kick(2.25, 0.55);

// 02–04 GROOVE (2.5 – 11.5): four-on-the-floor, claps on 2 & 4, offbeat hats, sidechained sub + pads.
const BARS = [
  { t: 2.5, root: 33, pad: [45, 52, 55, 59, 60] }, // Am9
  { t: 4.5, root: 29, pad: [41, 48, 52, 57, 60] }, // Fmaj7
  { t: 6.5, root: 36, pad: [48, 52, 55, 59, 62] }, // Cmaj9
  { t: 8.5, root: 31, pad: [43, 50, 55, 59, 64] }, // G6/9
  { t: 10.5, root: 33, pad: [45, 52, 57, 60, 64], len: 1 }, // Am
];
const kicks = [];
for (let t = 2.5; t < 11.5 - 1e-6; t += 0.5) {
  kick(t, 1);
  kicks.push(t);
}
for (let t = 3.0; t < 11.5; t += 1.0) clap(t, 0.9, 0.08);
for (let t = 2.75; t < 11.5; t += 0.5) hat(t, 0.95, true, 0.18);
for (let t = 2.5; t < 11.5 - 1e-6; t += 0.125) if (Math.abs(((t - 2.75) / 0.5) % 1) > 1e-3) hat(t, 0.45, false, -0.22);
const BASS_PATTERN = [
  [0.0, 0.36, 0],
  [0.75, 0.18, 0],
  [1.0, 0.36, 0],
  [1.5, 0.16, 12],
  [1.75, 0.18, 0],
];
for (const b of BARS) {
  const len = b.len ?? 2;
  pad(b.t, len - 0.02, b.pad, 1, { fc: b.t >= 8.5 ? 2600 : 2000, attack: 0.05, release: 0.35 });
  for (const [o, d, oct] of BASS_PATTERN) if (o < len) sub(b.t + o, d, hz(b.root + oct), 1);
}
// 03 FLOW: a bright pluck arpeggio — the team moving in step.
const ARP = { 4.5: [65, 69, 72, 76], 6.5: [72, 76, 79, 83] };
for (const [start, notes] of Object.entries(ARP)) {
  for (let k = 0; k < 16; k++) pluck(Number(start) + k * 0.125, notes[(k * 3) % 4] + (k % 8 >= 4 ? 12 : 0), 0.5, k % 2 ? 0.45 : -0.45, { decay: 9, send: 0.5 });
}
// Transitions inside the groove.
swell(4.08, 4.5, 0.7);
swell(8.14, 8.5, 0.8);
riser(10.4, 11.5, 0.45, { f0: 500, f1: 5000 });

// 05 OPEN (11.5 – 13): breakdown — muffled pad, two kicks, a long riser into the logo.
pad(11.5, 1.35, [45, 52, 57, 60, 64], 0.8, { fc: 650, attack: 0.02, release: 0.1, send: 0.6 });
sub(11.5, 1.2, hz(33), 0.8);
kick(11.5, 0.9);
kick(12.0, 0.75);
kick(12.5, 0.6);
kick(12.75, 0.5);
riser(12.1, 12.98, 1.0);
swell(12.55, 12.98, 0.9);

// 06 DISPATCH (13 – 15): resolve to the relative major — Cmaj9, then a bell arp as the wordmark lands.
kick(13.0, 1);
pad(13.0, 1.6, [48, 55, 59, 62, 64], 1.25, { fc: 3000, attack: 0.03, release: 0.45, send: 0.8 });
sub(13.0, 1.5, hz(36), 1.1);
sub(13.5, 1.1, hz(24), 0.8);
[
  [13.5, 72],
  [13.625, 76],
  [13.75, 79],
  [13.875, 83],
  [14.0, 84],
  [14.125, 88],
].forEach(([t, n], k) => pluck(t, n, 0.55, k % 2 ? 0.4 : -0.4, { decay: 3.2, send: 0.85, bright: 0.7 }));

// ── SFX layer, on the picture's exact frames ────────────────────────────────
sfx("ping", 0.52, 0.22, { max: 0.6, pan: -0.4 });
sfx("notification", 1.02, 0.2, { max: 0.5, pan: 0.4 });
sfx("ping", 1.55, 0.2, { max: 0.5, pan: 0.3 });
sfx("glitch-1", 1.62, 0.3, { max: 0.5 });
sfx("ping", 1.86, 0.18, { max: 0.4, pan: -0.3 });
sfx("whoosh-short", 2.2, 0.7, { align: "peak" });
sfx("click", 2.3, 0.6);
sfx("whoosh", 2.34, 0.35, { align: "peak" });
sfx("impact-bass-1", 2.5, 0.85);
sfx("pop", 2.82, 0.28);
[3.36, 3.44, 3.52, 3.6, 3.68].forEach((t, k) => sfx("click-soft", t, 0.28, { pan: -0.2 + k * 0.1 }));
sfx("whoosh", 4.46, 0.5, { align: "peak" });
sfx("pop", 4.84, 0.4);
sfx("notification", 4.86, 0.22, { max: 0.6 });
sfx("click", 5.92, 0.55);
sfx("pop", 6.02, 0.32);
sfx("typing", 6.48, 0.4, { max: 0.74, fade: 0.05 });
sfx("pop", 6.8, 0.25);
sfx("click", 7.78, 0.5);
sfx("sparkle", 7.84, 0.35, { max: 1.2 });
sfx("whoosh-cinematic", 8.46, 0.55, { align: "peak", max: 3.2 });
sfx("impact-bass-2", 8.5, 0.4, { max: 1.4 });
[9.12, 9.3, 9.48, 9.66].forEach((t) => sfx("click-soft", t, 0.45));
sfx("pop", 10.0, 0.4);
sfx("sparkle", 10.0, 0.35, { max: 1.2 });
sfx("click", 10.24, 0.55);
sfx("whoosh-short", 10.38, 0.22, { align: "peak" });
sfx("whoosh-short", 11.3, 0.4, { align: "peak" });
sfx("typing", 11.6, 0.5, { max: 0.48, fade: 0.04 });
[12.1, 12.17, 12.24, 12.31].forEach((t) => sfx("click-soft", t, 0.18));
[12.36, 12.43, 12.5].forEach((t) => sfx("pop", t, 0.18));
sfx("whoosh", 12.74, 0.5, { align: "peak" });
sfx("whoosh-short", 13.08, 0.6, { align: "peak" });
sfx("impact-bass-1", 13.5, 0.75);
sfx("chime", 14.02, 0.3);

// ── MIX ──────────────────────────────────────────────────────────────────────
// Sidechain: bass + pads duck under every groove kick.
const duck = new Float32Array(N).fill(1);
for (const t of [...kicks, 11.5, 12.0, 13.0]) {
  const i0 = at(t);
  for (let i = 0; i < at(0.32); i++) if (i0 + i < N) duck[i0 + i] = Math.min(duck[i0 + i], 1 - 0.72 * Math.exp(-(i / SR) / 0.075));
}
// Freeverb-lite on the send bus.
function reverb(inL, inR) {
  const outL = new Float32Array(N);
  const outR = new Float32Array(N);
  const combsD = [1557, 1617, 1491, 1422, 1277, 1356];
  const apD = [556, 441, 341];
  for (const [inp, out, spread] of [
    [inL, outL, 0],
    [inR, outR, 23],
  ]) {
    const combs = combsD.map((d) => ({ buf: new Float32Array(d + spread), i: 0, lp: 0 }));
    const aps = apD.map((d) => ({ buf: new Float32Array(d + spread), i: 0 }));
    for (let n = 0; n < N; n++) {
      const x = inp[n] * 0.2;
      let y = 0;
      for (const c of combs) {
        const o = c.buf[c.i];
        c.lp = o * 0.72 + c.lp * 0.28;
        c.buf[c.i] = x + c.lp * 0.83;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      for (const a of aps) {
        const b = a.buf[a.i];
        const v = -y + b;
        a.buf[a.i] = y + b * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = v;
      }
      out[n] = y;
    }
  }
  return [outL, outR];
}
const [RVL, RVR] = reverb(SEND[0], SEND[1]);

const outL = new Float32Array(N);
const outR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const d = duck[i];
  for (const [ch, out, rv] of [
    [0, outL, RVL],
    [1, outR, RVR],
  ]) {
    const music = DRUMS[ch][i] * 0.95 + BASS[ch][i] * d * 1.0 + PADS[ch][i] * d * 0.9 + KEYS[ch][i] * 0.8 + FX[ch][i] * 0.8 + rv[i] * 0.55;
    out[i] = music * 0.5 + SFX[ch][i] * 0.62;
  }
}
// Master: gentle glue + soft clip, a 250ms fade-in guard and a 0.6s tail fade.
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.01) * (t > 14.4 ? Math.max(0, (15 - t) / 0.6) : 1);
  outL[i] = Math.tanh(outL[i]) * fade;
  outR[i] = Math.tanh(outR[i]) * fade;
  peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
}
// Loudness trim: measured with ffmpeg ebur128 to land near -14 LUFS (web delivery).
const gain = Math.min(0.89 / peak, LOUD_TRIM);

// ── Write 24-bit WAV ────────────────────────────────────────────────────────
const bytes = 3;
const data = Buffer.alloc(N * 2 * bytes);
for (let i = 0; i < N; i++) {
  for (const [c, src] of [
    [0, outL],
    [1, outR],
  ]) {
    const v = Math.max(-1, Math.min(1, src[i] * gain));
    const s = Math.round(v * 8388607);
    data.writeIntLE(s, (i * 2 + c) * bytes, 3);
  }
}
const hdr = Buffer.alloc(44);
hdr.write("RIFF", 0);
hdr.writeUInt32LE(36 + data.length, 4);
hdr.write("WAVE", 8);
hdr.write("fmt ", 12);
hdr.writeUInt32LE(16, 16);
hdr.writeUInt16LE(1, 20);
hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24);
hdr.writeUInt32LE(SR * 2 * bytes, 28);
hdr.writeUInt16LE(2 * bytes, 32);
hdr.writeUInt16LE(bytes * 8, 34);
hdr.write("data", 36);
hdr.writeUInt32LE(data.length, 40);
mkdirSync(join(ROOT, "assets/audio"), { recursive: true });
writeFileSync(join(ROOT, "assets/audio/score.wav"), Buffer.concat([hdr, data]));
console.log(`score.wav  ${DUR}s  ${SR}Hz  peak-normalized ×${gain.toFixed(2)}`);
