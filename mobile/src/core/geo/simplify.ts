/** Douglas-Peucker sobre puntos en metros (x, y). Devuelve los índices que se conservan. */
export function simplifyIndices(xs: number[], ys: number[], tolerance: number): number[] {
  const n = xs.length;
  if (n <= 2) return xs.map((_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let dMax = tolerance;
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const len = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const d = len === 0 ? Math.hypot(xs[i] - xs[a], ys[i] - ys[a]) : Math.abs(dy * (xs[i] - xs[a]) - dx * (ys[i] - ys[a])) / len;
      if (d > dMax) {
        dMax = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  keep.forEach((k, i) => k && out.push(i));
  return out;
}
