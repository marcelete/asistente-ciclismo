import { GainAccumulator } from '../elevation/gain';
import { haversineMeters } from '../geo/distance';
import { HrAccumulator } from '../load/hrStats';
import type { HrHistogram } from '../load/hrStats';
import type { LiveSnapshot, Sample } from '../types';

export interface LiveStatsOptions {
  /** Precisión máxima aceptada del GPS, en metros. */
  maxAccuracy: number;
  /** Velocidad por debajo de la cual se considera que estás parado, en m/s. */
  movingThreshold: number;
  /** Velocidad máxima creíble en bici, en m/s (28 m/s ≈ 100 km/h). */
  maxPlausibleSpeed: number;
  /** Tamaño de la ventana (muestras) para suavizar la velocidad. */
  smoothing: number;
  /** Tamaño de la ventana (muestras) para suavizar la altitud. */
  altSmoothing: number;
  /** Umbral de desnivel (pico a valle), en metros. */
  gainThreshold: number;
}

export const DEFAULT_LIVE_OPTIONS: LiveStatsOptions = {
  maxAccuracy: 30,
  movingThreshold: 1,
  maxPlausibleSpeed: 28,
  smoothing: 5,
  altSmoothing: 15,
  gainThreshold: 5,
};

/**
 * Calcula en tiempo real, muestra a muestra, lo que se ve en la pantalla de grabación:
 * velocidad actual, media, máxima, distancia, desnivel positivo y altitud.
 * No depende de React Native, así que se puede probar en Node.
 */
export class LiveStats {
  private readonly opts: LiveStatsOptions;
  private startT: number | null = null;
  private lastT: number | null = null;
  private last: Sample | null = null;
  private distance = 0;
  private movingMs = 0;
  private maxSpeed = 0;
  private speedWindow: number[] = [];
  private altWindow: number[] = [];
  private smoothedAlt: number | null = null;
  private maxAlt: number | null = null;
  private minAlt: number | null = null;
  private readonly gain: GainAccumulator;
  private currentSpeed = 0;
  private readonly hr = new HrAccumulator();

  constructor(opts: Partial<LiveStatsOptions> = {}) {
    this.opts = { ...DEFAULT_LIVE_OPTIONS, ...opts };
    this.gain = new GainAccumulator(this.opts.gainThreshold);
  }

  /** Incorpora una muestra. Devuelve false si se descartó por mala calidad. */
  push(s: Sample): boolean {
    // La FC no depende del GPS: cuenta aunque la posición de esta muestra se descarte.
    this.hr.push(s.t, s.hr);
    if (s.acc !== null && s.acc > this.opts.maxAccuracy) return false;
    if (this.lastT !== null && s.t <= this.lastT) return false;

    let segSpeed: number | null = null;
    let dt = 0;
    if (this.last) {
      dt = (s.t - this.last.t) / 1000;
      const d = haversineMeters(this.last.lat, this.last.lon, s.lat, s.lon);
      segSpeed = dt > 0 ? d / dt : null;
      // Un salto imposible entre dos puntos se descarta sin mover la referencia.
      if (segSpeed !== null && segSpeed > this.opts.maxPlausibleSpeed) return false;
      this.distance += d;
    }

    if (this.startT === null) this.startT = s.t;

    // Preferimos la velocidad Doppler del GPS; si falta, la derivada de las posiciones. Un 0 del
    // GPS que contradice un avance claro (>2,5 m/s entre posiciones) también se reemplaza: pasa
    // con proveedores que no informan velocidad, como el emulador.
    const doppler = s.speed !== null && s.speed >= 0 ? s.speed : null;
    const contradicted = doppler === 0 && segSpeed !== null && segSpeed > 2.5;
    const raw = doppler !== null && !contradicted ? doppler : (segSpeed ?? 0);
    const sane = raw <= this.opts.maxPlausibleSpeed ? raw : (segSpeed ?? 0);
    this.speedWindow.push(sane);
    if (this.speedWindow.length > this.opts.smoothing) this.speedWindow.shift();
    this.currentSpeed = this.speedWindow.reduce((a, b) => a + b, 0) / this.speedWindow.length;

    if (this.speedWindow.length >= Math.min(3, this.opts.smoothing)) {
      // La máxima usa una mediana de 3 para ignorar picos aislados.
      const tail = this.speedWindow.slice(-3).sort((a, b) => a - b);
      const med = tail[Math.floor(tail.length / 2)];
      if (med > this.maxSpeed) this.maxSpeed = med;
    }

    // Para decidir si hay movimiento se usa la velocidad derivada de las posiciones: es más
    // robusta que la del GPS cerca de cero y cubre los huecos de señal.
    if (dt > 0 && (segSpeed ?? sane) >= this.opts.movingThreshold) this.movingMs += dt * 1000;

    if (s.alt !== null) {
      this.altWindow.push(s.alt);
      if (this.altWindow.length > this.opts.altSmoothing) this.altWindow.shift();
      this.smoothedAlt = this.altWindow.reduce((a, b) => a + b, 0) / this.altWindow.length;
      this.gain.push(this.smoothedAlt);
      // Los extremos se toman recién con la ventana llena, para que el ruido del arranque no los fije.
      if (this.altWindow.length >= Math.min(5, this.opts.altSmoothing)) {
        if (this.maxAlt === null || this.smoothedAlt > this.maxAlt) this.maxAlt = this.smoothedAlt;
        if (this.minAlt === null || this.smoothedAlt < this.minAlt) this.minAlt = this.smoothedAlt;
      }
    }

    this.last = s;
    this.lastT = s.t;
    return true;
  }

  snapshot(): LiveSnapshot {
    const elapsedSec = this.startT !== null && this.lastT !== null ? (this.lastT - this.startT) / 1000 : 0;
    const movingSec = this.movingMs / 1000;
    return {
      speed: this.currentSpeed,
      avgMovingSpeed: movingSec > 0 ? this.distance / movingSec : 0,
      avgTotalSpeed: elapsedSec > 0 ? this.distance / elapsedSec : 0,
      maxSpeed: this.maxSpeed,
      distance: this.distance,
      elevationGain: this.gain.total,
      elevationLoss: this.gain.totalLoss,
      maxAltitude: this.maxAlt,
      minAltitude: this.minAlt,
      altitude: this.smoothedAlt,
      elapsedSec,
      movingSec,
      hr: this.hr.current,
      avgHr: this.hr.average,
      maxHr: this.hr.maximum,
    };
  }

  /** Segundos pasados en cada pulsación, para las zonas y la carga (null si no hubo sensor). */
  hrHistogram(): HrHistogram | null {
    return this.hr.histogram();
  }
}
