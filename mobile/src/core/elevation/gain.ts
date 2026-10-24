/** Media móvil centrada con ventana impar. Los bordes usan la ventana disponible. */
export function smoothMovingAverage(values: number[], window: number): number[] {
  if (window <= 1 || values.length === 0) return values.slice();
  const half = Math.floor(window / 2);
  const out = new Array<number>(values.length);
  let sum = 0;
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < values.length; i++) {
    const wantLo = Math.max(0, i - half);
    const wantHi = Math.min(values.length - 1, i + half);
    while (hi < wantHi) sum += values[++hi];
    while (lo < wantLo) sum -= values[lo++];
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

/**
 * Acumulador de desnivel con filtro de picos y valles (zigzag).
 *
 * Un cambio de sentido solo se confirma cuando la altitud se aleja del último extremo más de
 * `threshold` metros. El ruido del GPS, que oscila varios metros aun parado, queda por debajo
 * del umbral y no suma. A diferencia de un umbral sobre el mínimo reciente, este filtro es
 * simétrico y no se sesga hacia arriba en terreno llano.
 */
export class GainAccumulator {
  private started = false;
  private ref = 0; // último extremo confirmado
  private ext = 0; // extremo en curso
  private lo = 0;
  private hi = 0;
  private dir: -1 | 0 | 1 = 0;
  private confirmedGain = 0;
  private confirmedLoss = 0;

  constructor(private readonly threshold = 5) {}

  push(alt: number): void {
    if (this.dir === 0) {
      // Fase inicial: aún no hay sentido. Se siguen el mínimo y el máximo hasta que su
      // separación supere el umbral; el sentido lo marca cuál de los dos es el más reciente.
      if (!this.started) {
        this.started = true;
        this.ref = alt;
        this.lo = alt;
        this.hi = alt;
        return;
      }
      if (alt < this.lo) this.lo = alt;
      if (alt > this.hi) this.hi = alt;
      if (this.hi - this.lo >= this.threshold) {
        if (alt >= this.hi) {
          this.ref = this.lo;
          this.ext = this.hi;
          this.dir = 1;
        } else {
          this.ref = this.hi;
          this.ext = this.lo;
          this.dir = -1;
        }
      }
      return;
    }
    if (this.dir === 1 && alt > this.ext) {
      this.ext = alt;
    } else if (this.dir === -1 && alt < this.ext) {
      this.ext = alt;
    } else if (this.dir === 1 && this.ext - alt >= this.threshold) {
      // Cambio de sentido: se confirma el pico.
      this.confirmedGain += this.ext - this.ref;
      this.ref = this.ext;
      this.ext = alt;
      this.dir = -1;
    } else if (this.dir === -1 && alt - this.ext >= this.threshold) {
      this.confirmedLoss += this.ref - this.ext;
      this.ref = this.ext;
      this.ext = alt;
      this.dir = 1;
    }
  }

  /** Desnivel positivo: lo confirmado más la subida en curso si ya superó el umbral. */
  get total(): number {
    const pending = this.dir === 1 ? this.ext - this.ref : 0;
    return this.confirmedGain + pending;
  }

  get totalLoss(): number {
    const pending = this.dir === -1 ? this.ref - this.ext : 0;
    return this.confirmedLoss + pending;
  }
}

/** Desnivel positivo y negativo totales de una serie de altitudes (ya suavizada). */
export function elevationGainLoss(alts: number[], threshold = 5): { gain: number; loss: number } {
  const acc = new GainAccumulator(threshold);
  for (const a of alts) acc.push(a);
  return { gain: acc.total, loss: acc.totalLoss };
}
