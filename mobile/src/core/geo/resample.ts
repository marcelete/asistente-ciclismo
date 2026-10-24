import type { Sample } from '../types';

function lerp(a: number | null, b: number | null, f: number): number | null {
  if (a === null || b === null) return null;
  return a + (b - a) * f;
}

/**
 * Remuestrea una serie a una muestra por segundo, interpolando linealmente entre muestras
 * contiguas. Los huecos mayores a `maxGapSec` no se rellenan: se emiten muestras con todos los
 * campos nulos (lat/lon se repiten con el último valor para conservar el tipo) y `gap = true`.
 */
export function resampleTo1Hz(
  samples: Sample[],
  maxGapSec = 10,
): { samples: Sample[]; gap: boolean[] } {
  if (samples.length === 0) return { samples: [], gap: [] };
  const out: Sample[] = [];
  const gap: boolean[] = [];
  const t0 = Math.ceil(samples[0].t / 1000) * 1000;
  let j = 0;
  for (let t = t0; t <= samples[samples.length - 1].t; t += 1000) {
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j];
    const b = samples[Math.min(j + 1, samples.length - 1)];
    const span = (b.t - a.t) / 1000;
    if (span > maxGapSec && t > a.t && t < b.t) {
      out.push({ t, lat: a.lat, lon: a.lon, alt: null, speed: null, hr: null, acc: null });
      gap.push(true);
      continue;
    }
    const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    out.push({
      t,
      lat: a.lat + (b.lat - a.lat) * f,
      lon: a.lon + (b.lon - a.lon) * f,
      alt: lerp(a.alt, b.alt, f),
      speed: lerp(a.speed, b.speed, f),
      hr: lerp(a.hr, b.hr, f),
      acc: lerp(a.acc, b.acc, f),
    });
    gap.push(false);
  }
  return { samples: out, gap };
}
