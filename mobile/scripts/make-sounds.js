/* global __dirname, Buffer */
// Genera los sonidos de la app (WAV mono, 22 kHz, 16 bits) por síntesis: sin muestras de terceros,
// sin licencias y siempre con el mismo resultado. Uso: `npm run sounds` en mobile/.
// Salida: assets/sounds/*.wav (se commitean junto con este script).
const fs = require('fs');
const path = require('path');

const RATE = 22050;
const OUT = path.join(__dirname, '..', 'assets', 'sounds');

/** Mezcla (suma) una nota dentro del buffer de muestras. */
function addTone(buf, { start, dur, freq, gain = 0.5, partials = [[1, 1]], attack = 0.004, decay = 6 }) {
  const first = Math.floor(start * RATE);
  const n = Math.floor(dur * RATE);
  for (let i = 0; i < n && first + i < buf.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / attack) * Math.exp(-decay * t);
    let v = 0;
    for (const [mult, amp] of partials) v += amp * Math.sin(2 * Math.PI * freq * mult * t);
    buf[first + i] += gain * env * v;
  }
}

/** Normaliza para que el pico quede en 0,85 y lo pasa a PCM de 16 bits con encabezado WAV. */
function toWav(buf) {
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.85 / peak : 1;
  const data = Buffer.alloc(buf.length * 2);
  buf.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * k)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const note = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);
const C5 = note(3);
const E5 = note(7);
const G5 = note(10);
const C6 = note(15);

// Timbre de bici: dos golpes metálicos con parciales inarmónicos que se apagan rápido.
const BELL_PARTIALS = [
  [1, 1],
  [2.76, 0.6],
  [5.4, 0.35],
  [8.93, 0.15],
];
// Tono de trompeta simple: armónicos que bajan de a poco.
const BRASS = [
  [1, 1],
  [2, 0.6],
  [3, 0.4],
  [4, 0.25],
];

const sounds = {
  // Al abrir la app.
  bell: (b) => {
    addTone(b, { start: 0, dur: 0.7, freq: 2093, partials: BELL_PARTIALS, decay: 7 });
    addTone(b, { start: 0.22, dur: 0.9, freq: 2093, partials: BELL_PARTIALS, decay: 5, gain: 0.8 });
  },
  // Salida importada.
  ding: (b) => {
    addTone(b, { start: 0, dur: 0.3, freq: note(12), decay: 9 });
    addTone(b, { start: 0.11, dur: 0.45, freq: note(19), decay: 7, gain: 0.7 });
  },
  // Récord: fanfarria corta.
  fanfare: (b) => {
    [
      [0, C5],
      [0.14, E5],
      [0.28, G5],
    ].forEach(([start, freq]) => addTone(b, { start, dur: 0.22, freq, partials: BRASS, decay: 5, gain: 0.5 }));
    [C5, E5, G5, C6].forEach((freq) => addTone(b, { start: 0.45, dur: 0.9, freq, partials: BRASS, decay: 3.2, gain: 0.35 }));
  },
  // Premio: destellos que suben.
  sparkle: (b) => {
    [0, 4, 7, 12, 16, 19, 24].forEach((st, i) =>
      addTone(b, { start: i * 0.07, dur: 0.35, freq: note(12 + st), decay: 10, gain: 0.45 }),
    );
  },
  // Meta cumplida: acorde mayor que se apaga.
  chord: (b) => {
    [C5, E5, G5].forEach((freq, i) => addTone(b, { start: i * 0.04, dur: 1.1, freq, partials: [[1, 1], [2, 0.3]], decay: 3, gain: 0.4 }));
  },
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, build] of Object.entries(sounds)) {
  const buf = new Float64Array(Math.floor(RATE * 1.6));
  build(buf);
  // Se recorta el silencio del final.
  let end = buf.length;
  while (end > 0 && Math.abs(buf[end - 1]) < 1e-4) end--;
  const wav = toWav(buf.subarray(0, Math.min(buf.length, end + Math.floor(RATE * 0.02))));
  fs.writeFileSync(path.join(OUT, `${name}.wav`), wav);
  console.log(`${name}.wav ${Math.round(wav.length / 1024)} KB`);
}
