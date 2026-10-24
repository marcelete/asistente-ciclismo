import { hrZoneRanges } from '../load/hr';
import type { HrProfile } from '../load/hr';
import type { SessionKind } from './rules';

/** Nombres de los días, con 0 = lunes. */
export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const KIND_TITLE: Record<SessionKind, string> = {
  recovery: 'Recuperación',
  endurance: 'Rodaje de resistencia',
  long: 'Salida larga',
  tempo: 'Tempo',
  intervals: 'Intervalos',
};

const dur = (min: number) => (min >= 90 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`);

/** Texto de una sesión con tus zonas de FC (si hay perfil). */
export function sessionText(kind: SessionKind, durationMin: number, zone: number, hr: HrProfile | null): string {
  const range = hr ? hrZoneRanges(hr).find((z) => z.zone === zone) : undefined;
  const where = range ? `zona ${zone} (${range.min}–${range.max} lpm)` : `zona ${zone}`;
  switch (kind) {
    case 'recovery':
      return `${dur(durationMin)} muy suaves en ${where}. Pedaleá liviano y charlando.`;
    case 'endurance':
      return `${dur(durationMin)} parejos en ${where}. Ritmo en el que podés conversar sin cortar las frases.`;
    case 'long':
      return `${dur(durationMin)} en ${where}. Tomá agua y comé algo cada 45 minutos; es la salida que más suma.`;
    case 'tempo':
      return `${dur(durationMin)} con 2 bloques de 15 a 20 min en ${where}, intercalados con 5 min suaves.`;
    case 'intervals':
      return `${dur(durationMin)} con 5 a 6 repeticiones de 3 a 4 min fuertes (${where}) y 3 min suaves entre cada una. Mejor en subida.`;
  }
}
