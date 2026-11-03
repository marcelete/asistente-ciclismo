/** Media y variación de una serie que llega de a una muestra (algoritmo de Welford). */
export class RunningStats {
  private n = 0;
  private mean = 0;
  private m2 = 0;

  add(x: number): void {
    this.n++;
    const d = x - this.mean;
    this.mean += d / this.n;
    this.m2 += d * (x - this.mean);
  }

  get count(): number {
    return this.n;
  }

  get average(): number | null {
    return this.n > 0 ? this.mean : null;
  }

  /** Coeficiente de variación (desvío / media): cuanto más bajo, más parejo el ritmo. */
  get cv(): number | null {
    if (this.n < 2 || this.mean <= 0) return null;
    return Math.sqrt(this.m2 / (this.n - 1)) / this.mean;
  }
}

/** Promedio de una ventana móvil por tiempo: las muestras más viejas que `windowSec` se descartan. */
export class TimeWindow {
  private items: { t: number; v: number }[] = [];

  constructor(private readonly windowSec: number) {}

  add(t: number, v: number): void {
    this.items.push({ t, v });
    const min = t - this.windowSec * 1000;
    while (this.items.length > 0 && this.items[0].t < min) this.items.shift();
  }

  clear(): void {
    this.items = [];
  }

  get average(): number | null {
    if (this.items.length === 0) return null;
    return this.items.reduce((s, x) => s + x.v, 0) / this.items.length;
  }

  /** Mediana de la ventana: un dato suelto malo del GPS no la mueve. */
  get median(): number | null {
    if (this.items.length === 0) return null;
    const v = this.items.map((x) => x.v).sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);
    return v.length % 2 === 1 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
}

/** Calificación de la estabilidad según el tiempo en banda y el coeficiente de variación. */
export function steadinessLabel(inRange: number | null, cv: number | null): string {
  if (inRange === null) return 'Sin datos';
  if (inRange >= 0.85 && (cv === null || cv < 0.06)) return 'Muy parejo';
  if (inRange >= 0.65) return 'Parejo';
  if (inRange >= 0.4) return 'Con altibajos';
  return 'Irregular';
}
