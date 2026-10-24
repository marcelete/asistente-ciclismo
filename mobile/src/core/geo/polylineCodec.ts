/** Polilínea codificada de Google (precisión 5, ~1 m): guarda una traza en un texto corto. */
export function encodePolyline(points: [number, number][]): string {
  let prevLat = 0;
  let prevLon = 0;
  let out = '';
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lon] of points) {
    const la = Math.round(lat * 1e5);
    const lo = Math.round(lon * 1e5);
    out += enc(la - prevLat) + enc(lo - prevLon);
    prevLat = la;
    prevLon = lo;
  }
  return out;
}

export function decodePolyline(text: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (i >= text.length) return null;
      b = text.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < text.length) {
    const a = next();
    const b = next();
    if (a === null || b === null) break;
    lat += a;
    lon += b;
    out.push([lat / 1e5, lon / 1e5]);
  }
  return out;
}
