/** Una muestra de la grabación (normalmente 1 por segundo). */
export interface Sample {
  /** Marca de tiempo en milisegundos (epoch). */
  t: number;
  lat: number;
  lon: number;
  /** Altitud en metros (puede ser del GPS, del barómetro o del terreno). */
  alt: number | null;
  /** Velocidad instantánea en m/s, tal como la entrega el GPS. */
  speed: number | null;
  /** Frecuencia cardíaca en latidos por minuto. */
  hr: number | null;
  /** Precisión horizontal estimada del GPS en metros. */
  acc: number | null;
}

export interface LiveSnapshot {
  /** Velocidad actual suavizada, en m/s. */
  speed: number;
  /** Velocidad media en movimiento, en m/s. */
  avgMovingSpeed: number;
  /** Velocidad media total (incluye paradas), en m/s. */
  avgTotalSpeed: number;
  /** Velocidad máxima, en m/s. */
  maxSpeed: number;
  /** Distancia recorrida, en metros. */
  distance: number;
  /** Desnivel positivo acumulado, en metros. */
  elevationGain: number;
  /** Desnivel negativo acumulado, en metros. */
  elevationLoss: number;
  /** Altitud máxima alcanzada (suavizada), en metros (null si no hay datos). */
  maxAltitude: number | null;
  /** Altitud mínima (suavizada), en metros (null si no hay datos). */
  minAltitude: number | null;
  /** Altitud actual suavizada, en metros (null si no hay datos). */
  altitude: number | null;
  /** Tiempo transcurrido, en segundos. */
  elapsedSec: number;
  /** Tiempo en movimiento, en segundos. */
  movingSec: number;
  /** Frecuencia cardíaca actual. */
  hr: number | null;
  /** Frecuencia cardíaca media, ponderada por tiempo (null si no hay sensor). */
  avgHr: number | null;
  /** Frecuencia cardíaca máxima (sin picos aislados del sensor). */
  maxHr: number | null;
}
