const G = 9.80665;
/** Constante específica del aire seco, J/(kg·K). */
const R_DRY = 287.058;
/** Constante específica del vapor de agua, J/(kg·K). */
const R_VAPOR = 461.495;

export interface PowerParams {
  /** Masa total en kg: ciclista + bici + equipo. */
  massKg: number;
  /** Coeficiente de resistencia a la rodadura (≈0,004-0,008 en asfalto). */
  crr: number;
  /** Área de arrastre CdA en m² (≈0,28 en posición agresiva, 0,35-0,40 erguido). */
  cdA: number;
  /** Eficiencia de la transmisión (≈0,97). */
  drivetrainEff: number;
  /** Densidad del aire en kg/m³. */
  rho: number;
}

export const DEFAULT_POWER_PARAMS: Omit<PowerParams, 'massKg'> = {
  crr: 0.0055,
  cdA: 0.36,
  drivetrainEff: 0.97,
  rho: 1.2,
};

/**
 * Densidad del aire a partir de temperatura (°C), presión absoluta (hPa) y humedad relativa (%).
 * Usa la fórmula de Magnus para la presión de vapor de saturación.
 */
export function airDensity(tempC: number, pressureHpa: number, humidityPct = 50): number {
  const tK = tempC + 273.15;
  const pTotal = pressureHpa * 100;
  const pSat = 610.94 * Math.exp((17.625 * tempC) / (tempC + 243.04));
  const pVapor = (Math.min(100, Math.max(0, humidityPct)) / 100) * pSat;
  const pDry = pTotal - pVapor;
  return pDry / (R_DRY * tK) + pVapor / (R_VAPOR * tK);
}

export interface PowerInput {
  /** Velocidad respecto del suelo, m/s. */
  speed: number;
  /** Pendiente como cociente subida/recorrido horizontal (0,05 = 5 %). */
  grade: number;
  /** Aceleración, m/s². */
  accel?: number;
  /** Viento en contra, m/s (negativo si es a favor). */
  headwind?: number;
}

/**
 * Potencia estimada en los pedales, en watts, con el modelo físico estándar:
 * rodadura + gravedad + aerodinámica + aceleración, dividido por la eficiencia de la transmisión.
 * En descensos o frenadas devuelve 0 (no se pedalea o la potencia es negativa).
 */
export function estimatePower(p: PowerParams, i: PowerInput): number {
  const theta = Math.atan(i.grade);
  const airSpeed = i.speed + (i.headwind ?? 0);
  const rolling = p.massKg * G * p.crr * Math.cos(theta);
  const gravity = p.massKg * G * Math.sin(theta);
  const aero = 0.5 * p.rho * p.cdA * airSpeed * Math.abs(airSpeed);
  const inertia = p.massKg * (i.accel ?? 0);
  const wheelPower = (rolling + gravity + aero + inertia) * i.speed;
  return wheelPower > 0 ? wheelPower / p.drivetrainEff : 0;
}
