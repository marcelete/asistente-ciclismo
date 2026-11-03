import type { Block, BlockRole, Target } from '../types';
import type { ZoneContext } from '../zones';
import { resolveTarget, steadyPaceTarget } from '../zones';
import { FINISH_CUE, HALF_CUE, HYDRATE_CUE, IN_RANGE_CUE, LAST_MINUTE_CUE, PAUSED_CUE, RESUMED_CUE, correctionCue, startCue } from './cues';
import { RunningStats, TimeWindow } from './steadiness';

/** Un bloque listo para el entrenador en vivo: con su objetivo ya en números. */
export interface LiveBlock {
  label: string;
  role: BlockRole;
  /** `Infinity` para un bloque sin fin (modo "mantener velocidad"). */
  durationSec: number;
  target: Target | null;
  cue?: string;
}

export type LiveStatus = 'none' | 'grace' | 'below' | 'in' | 'above';

export type CueKind = 'start' | 'count' | 'half' | 'lastMinute' | 'raise' | 'lower' | 'inRange' | 'hydrate' | 'finish' | 'pause' | 'resume';

/** Lo que el celular tiene que decir, sonar o vibrar. */
export interface CoachEvent {
  kind: CueKind;
  blockIndex: number;
  text: string;
}

export interface EngineOptions {
  /** Segundos mínimos entre dos avisos de corrección. */
  cueEverySec: number;
  /** Ventanas de suavizado. */
  speedWindowSec: number;
  hrWindowSec: number;
  /** Margen al empezar un bloque antes de juzgar. */
  graceSpeedSec: number;
  graceHrSec: number;
  /** Segundos que tiene que sostenerse un estado nuevo antes de avisar. */
  hysteresisSec: number;
  /** Recordatorio de hidratación, o `null` para no avisar. */
  hydrateEverySec: number | null;
  /** Si estás detenido, el tiempo del bloque no avanza. */
  pauseWhenStopped: boolean;
  /** Pasos por minuto (correr): ventana y margen, más cortos porque los bloques de técnica duran poco. */
  cadenceWindowSec?: number;
  graceCadenceSec?: number;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  cueEverySec: 25,
  speedWindowSec: 10,
  hrWindowSec: 5,
  graceSpeedSec: 15,
  graceHrSec: 60,
  hysteresisSec: 5,
  hydrateEverySec: null,
  pauseWhenStopped: true,
  cadenceWindowSec: 8,
  graceCadenceSec: 6,
};

/** Correr: el GPS es más ruidoso a pie, así que la mediana mira 15 segundos. */
export const RUN_ENGINE_OPTIONS: Partial<EngineOptions> = { speedWindowSec: 15 };

export interface LiveInput {
  /** Velocidad en km/h, o `null` si no se conoce. */
  speedKmh: number | null;
  hr: number | null;
  /** Se está moviendo (para pausar el reloj del bloque cuando frenás). */
  moving: boolean;
  /** Correr: pasos por minuto, si el podómetro los da. */
  cadence?: number | null;
}

export interface LiveSnapshot {
  blockIndex: number;
  block: LiveBlock | null;
  blockElapsedSec: number;
  blockRemainingSec: number;
  totalElapsedSec: number;
  status: LiveStatus;
  /** Valor suavizado del objetivo actual (km/h, lpm…), o `null`. */
  value: number | null;
  speedKmh: number | null;
  hr: number | null;
  cadence: number | null;
  finished: boolean;
  paused: boolean;
}

export interface BlockResult {
  block: number;
  seconds: number;
  avgValue: number | null;
  /** Fracción del tiempo evaluado que estuvo dentro de la banda. */
  inRange: number | null;
  cv: number | null;
}

/** Objetivos que se miden y se corrigen en vivo (el RPE y la potencia estimada no). */
const JUDGED: Target['kind'][] = ['speed', 'hr', 'cadence'];

/** Cuenta regresiva: los últimos segundos de un bloque de trabajo o pausa. */
const COUNTDOWN = [3, 2, 1];
/** Un tick más largo que esto (el celular se durmió) no cuenta entero. */
const MAX_STEP_SEC = 5;

/**
 * Máquina de estados del entrenador en vivo. Recibe lo que pasa cada segundo con `step` y devuelve los
 * avisos que hay que dar. No sabe nada del celular: se prueba con salidas sintéticas.
 */
export class CoachEngine {
  private index = 0;
  private blockElapsed = 0;
  private total = 0;
  private lastMs: number | null = null;
  private paused = false;
  private finished = false;
  private status: LiveStatus = 'none';
  private candidate: LiveStatus = 'none';
  private candidateSince = 0;
  private lastCorrectionAt = -Infinity;
  private lastHydrateAt = 0;
  private offRange = false;
  private firedHalf = false;
  private firedLast = false;
  private firedCount = new Set<number>();
  private started = false;
  private speed: TimeWindow;
  private hrWin: TimeWindow;
  private cadWin: TimeWindow;
  private lastCadence: number | null = null;
  private stats = new RunningStats();
  /** Velocidad de todo el bloque, aunque su objetivo no se mida (el test va por esfuerzo percibido). */
  private speedAll = new RunningStats();
  private evaluated = 0;
  private inRangeSec = 0;
  private results: BlockResult[] = [];
  private lastSpeed: number | null = null;
  private lastHr: number | null = null;

  constructor(
    private readonly blocks: LiveBlock[],
    private readonly opts: EngineOptions = DEFAULT_ENGINE_OPTIONS,
  ) {
    this.speed = new TimeWindow(opts.speedWindowSec);
    this.hrWin = new TimeWindow(opts.hrWindowSec);
    this.cadWin = new TimeWindow(opts.cadenceWindowSec ?? 8);
  }

  pause(): CoachEvent[] {
    if (this.paused || this.finished) return [];
    this.paused = true;
    return [this.event('pause', PAUSED_CUE)];
  }

  resume(): CoachEvent[] {
    if (!this.paused || this.finished) return [];
    this.paused = false;
    this.lastMs = null;
    return [this.event('resume', RESUMED_CUE)];
  }

  /** Pasa al bloque siguiente sin esperar a que termine. */
  skip(): CoachEvent[] {
    if (this.finished) return [];
    return this.advance();
  }

  private block(): LiveBlock | null {
    return this.blocks[this.index] ?? null;
  }

  private event(kind: CueKind, text: string): CoachEvent {
    return { kind, blockIndex: this.index, text };
  }

  private value(): number | null {
    const t = this.block()?.target;
    if (!t) return null;
    if (t.kind === 'speed') return this.speed.median;
    if (t.kind === 'hr') return this.hrWin.average;
    if (t.kind === 'cadence') return this.cadWin.average;
    return null;
  }

  private graceSec(): number {
    const kind = this.block()?.target?.kind;
    if (kind === 'hr') return this.opts.graceHrSec;
    if (kind === 'cadence') return this.opts.graceCadenceSec ?? 6;
    return this.opts.graceSpeedSec;
  }

  /**
   * Promedio del objetivo del bloque; si el objetivo no se mide (esfuerzo percibido, libre), la
   * velocidad media en km/h. Así el test de 30 minutos de correr deja su velocidad para el umbral.
   */
  private blockAverage(): number | null {
    const kind = this.block()?.target?.kind;
    return kind && JUDGED.includes(kind) ? this.stats.average : this.speedAll.average;
  }

  private closeBlock(): void {
    this.results.push({
      block: this.index,
      seconds: Math.round(this.blockElapsed),
      avgValue: this.blockAverage(),
      inRange: this.evaluated > 0 ? this.inRangeSec / this.evaluated : null,
      cv: this.stats.cv,
    });
  }

  private begin(): CoachEvent[] {
    const b = this.block();
    this.blockElapsed = 0;
    this.status = b?.target && JUDGED.includes(b.target.kind) ? 'grace' : 'none';
    this.candidate = this.status;
    this.firedHalf = false;
    this.firedLast = false;
    this.firedCount.clear();
    this.offRange = false;
    this.lastCorrectionAt = -Infinity;
    this.stats = new RunningStats();
    this.speedAll = new RunningStats();
    this.evaluated = 0;
    this.inRangeSec = 0;
    this.speed.clear();
    this.hrWin.clear();
    this.cadWin.clear();
    if (!b) return [];
    return [this.event('start', startCue(b.label, b.durationSec, b.target, b.cue, this.index, this.blocks.length))];
  }

  private advance(): CoachEvent[] {
    this.closeBlock();
    this.index++;
    if (this.index >= this.blocks.length) {
      this.finished = true;
      this.status = 'none';
      return [this.event('finish', FINISH_CUE)];
    }
    return this.begin();
  }

  /** Avanza el reloj hasta `nowMs` con lo que pasa ahora. Devuelve los avisos a dar, en orden. */
  step(nowMs: number, input: LiveInput): CoachEvent[] {
    if (this.finished || this.blocks.length === 0) return [];
    const events: CoachEvent[] = [];
    if (!this.started) {
      this.started = true;
      events.push(...this.begin());
    }

    const dt = this.lastMs === null ? 0 : Math.min(MAX_STEP_SEC, Math.max(0, (nowMs - this.lastMs) / 1000));
    this.lastMs = nowMs;
    this.lastSpeed = input.speedKmh;
    this.lastHr = input.hr;
    this.lastCadence = input.cadence ?? null;
    if (input.speedKmh !== null) this.speed.add(nowMs, input.speedKmh);
    if (input.hr !== null && input.hr > 0) this.hrWin.add(nowMs, input.hr);
    if (input.cadence !== null && input.cadence !== undefined && input.cadence > 0) this.cadWin.add(nowMs, input.cadence);
    if (this.paused) return events;

    const frozen = this.opts.pauseWhenStopped && !input.moving && this.block()?.target?.kind === 'speed';
    if (!frozen) {
      this.blockElapsed += dt;
      this.total += dt;
    }
    if (input.moving && input.speedKmh !== null && input.speedKmh > 0) this.speedAll.add(input.speedKmh);

    const b = this.block();
    if (!b) return events;

    // Hidratación: cada tanto, sin pisar el inicio de un bloque.
    if (this.opts.hydrateEverySec !== null && this.total - this.lastHydrateAt >= this.opts.hydrateEverySec && b.role !== 'warmup') {
      this.lastHydrateAt = this.total;
      events.push(this.event('hydrate', HYDRATE_CUE));
    }

    const remaining = b.durationSec - this.blockElapsed;
    if (Number.isFinite(b.durationSec)) {
      if (b.durationSec >= 240 && !this.firedHalf && this.blockElapsed >= b.durationSec / 2 && remaining > 60) {
        this.firedHalf = true;
        events.push(this.event('half', HALF_CUE));
      }
      if (b.durationSec >= 180 && !this.firedLast && remaining <= 60 && remaining > 3 && b.role === 'work') {
        this.firedLast = true;
        events.push(this.event('lastMinute', LAST_MINUTE_CUE));
      }
      for (const n of COUNTDOWN) {
        if (remaining <= n && remaining > n - 1 && !this.firedCount.has(n) && b.durationSec >= 20) {
          this.firedCount.add(n);
          events.push(this.event('count', String(n)));
        }
      }
    }

    events.push(...this.judge(b, dt, frozen));

    if (Number.isFinite(b.durationSec) && this.blockElapsed >= b.durationSec) events.push(...this.advance());
    return events;
  }

  /** Compara el valor suavizado con la banda y decide si hay que avisar. */
  private judge(b: LiveBlock, dt: number, frozen: boolean): CoachEvent[] {
    const target = b.target;
    if (!target || !JUDGED.includes(target.kind) || frozen) return [];
    if (this.blockElapsed < this.graceSec()) {
      this.status = 'grace';
      return [];
    }
    const v = this.value();
    if (v === null) {
      this.status = 'none';
      return [];
    }
    this.stats.add(v);
    this.evaluated += dt;
    const next: LiveStatus = v < target.min ? 'below' : v > target.max ? 'above' : 'in';
    if (next === 'in') this.inRangeSec += dt;

    if (next !== this.candidate) {
      this.candidate = next;
      this.candidateSince = this.total;
    }
    const stable = this.total - this.candidateSince >= this.opts.hysteresisSec;
    if (stable && next !== this.status) this.status = next;
    // Primer juicio después del margen: no hace falta esperar la histéresis.
    if (this.status === 'grace' || this.status === 'none') this.status = next;

    const events: CoachEvent[] = [];
    if (this.status === 'in') {
      if (this.offRange) {
        this.offRange = false;
        events.push(this.event('inRange', IN_RANGE_CUE));
      }
    } else if (this.status === 'below' || this.status === 'above') {
      this.offRange = true;
      if (this.total - this.lastCorrectionAt >= this.opts.cueEverySec) {
        this.lastCorrectionAt = this.total;
        const dir = this.status === 'below' ? 'raise' : 'lower';
        events.push(this.event(dir, correctionCue(dir, target, v)));
      }
    }
    return events;
  }

  snapshot(): LiveSnapshot {
    const b = this.block();
    return {
      blockIndex: Math.min(this.index, Math.max(0, this.blocks.length - 1)),
      block: b,
      blockElapsedSec: this.blockElapsed,
      blockRemainingSec: b ? Math.max(0, b.durationSec - this.blockElapsed) : 0,
      totalElapsedSec: this.total,
      status: this.status,
      value: this.value(),
      speedKmh: this.lastSpeed,
      hr: this.lastHr,
      cadence: this.lastCadence,
      finished: this.finished,
      paused: this.paused,
    };
  }

  /** Resultados de los bloques que ya terminaron, más el que está en curso. */
  blockResults(): BlockResult[] {
    if (this.finished || !this.block()) return [...this.results];
    return [
      ...this.results,
      {
        block: this.index,
        seconds: Math.round(this.blockElapsed),
        avgValue: this.blockAverage(),
        inRange: this.evaluated > 0 ? this.inRangeSec / this.evaluated : null,
        cv: this.stats.cv,
      },
    ];
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Banda de velocidad a sostener: si el objetivo ancho (por ejemplo, 70–80 % del FTP) deja más de
 * ±tolerancia, se angosta alrededor del centro para que el ritmo sea parejo.
 */
function narrow(t: Target, tolKmh: number, paceTolSec: number): Target {
  if (t.kind !== 'speed') return t;
  if (t.unit === 'min/km') {
    // Correr: la banda se mide en segundos por km alrededor del ritmo del centro.
    const pace = 3600 / ((t.min + t.max) / 2);
    const slow = 3600 / t.min;
    const fast = 3600 / t.max;
    return (slow - fast) / 2 > paceTolSec ? steadyPaceTarget(pace, paceTolSec) : t;
  }
  const center = (t.min + t.max) / 2;
  return (t.max - t.min) / 2 > tolKmh ? { ...t, min: round1(center - tolKmh), max: round1(center + tolKmh) } : t;
}

/** Bloques de una sesión listos para el motor, con los objetivos en números de la persona. */
export function toLiveBlocks(blocks: Block[], ctx: ZoneContext, speedTolKmh: number, paceTolSec = 10): LiveBlock[] {
  return blocks.map((b) => {
    const t = resolveTarget(b.intensity, ctx);
    return {
      label: b.label,
      role: b.role,
      durationSec: b.durationSec,
      target: t && b.role === 'work' ? narrow(t, speedTolKmh, paceTolSec) : t,
      cue: b.cue,
    };
  });
}

/** Correr, modo libre "Mantener ritmo": un bloque sin fin alrededor del ritmo elegido (segundos por km). */
export function steadyPaceBlocks(paceSec: number, tolSec: number): LiveBlock[] {
  return [{ label: 'Mantener ritmo', role: 'work', durationSec: Infinity, target: steadyPaceTarget(paceSec, tolSec) }];
}

/** Modo libre "Mantener velocidad": un solo bloque sin fin con una banda alrededor de la velocidad elegida. */
export function steadySpeedBlocks(centerKmh: number, tolKmh: number): LiveBlock[] {
  const c = Math.max(1, centerKmh);
  return [{ label: 'Mantener velocidad', role: 'work', durationSec: Infinity, target: { kind: 'speed', min: round1(Math.max(0, c - tolKmh)), max: round1(c + tolKmh), unit: 'km/h' } }];
}
