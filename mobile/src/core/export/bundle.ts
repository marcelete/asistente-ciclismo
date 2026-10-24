import type { Goal } from '../goals/goals';
import { hrZoneRanges } from '../load/hr';
import type { HrProfile } from '../load/hr';
import { fitnessSeries } from '../load/training';
import { shareableIndices } from '../elevation/privacy';
import type { ProfilePoint } from '../elevation/profile';
import type { RideRecord } from '../stats/rides';
import type { Settings } from '../../data/settings';
import { describeColumns, RIDE_COLUMNS, rowOf } from './columns';
import type { RideExportContext } from './columns';
import { isoLocal, num, toCsv } from './csv';
import type { BackupBike, BackupPart } from './backup';

/** Metros de cada punta que se sacan de puntos.csv con "Ocultar inicio y final". */
export const HIDE_ENDS_M = 300;

export interface SegmentEffortRow {
  segmentName: string;
  segmentLengthM: number;
  rideId: string;
  startT: number;
  durationSec: number;
  speedMs: number;
  avgHr: number | null;
}

export interface AwardRow {
  key: string;
  kind: string;
  title: string;
  rideId: string | null;
  t: number | null;
}

export interface BundleInput {
  rides: RideRecord[];
  goals: Goal[];
  settings: Settings;
  now: number;
  appVersion: string;
  ctx: RideExportContext;
  bikes: BackupBike[];
  bikeParts: BackupPart[];
  bikeKm: (bikeId: string) => { km: number; rides: number };
  segmentEfforts: SegmentEffortRow[];
  awards: AwardRow[];
  /** Ya armado: el JSON del respaldo, para el último archivo del ZIP. */
  backupJson: string;
}

const GOAL_UNIT: Record<string, { unit: string; div: number }> = {
  distance: { unit: 'km', div: 1000 },
  rides: { unit: 'salidas', div: 1 },
  time: { unit: 'horas', div: 3600 },
  elevation: { unit: 'm', div: 1 },
};

export function salidasCsv(rides: RideRecord[], ctx: RideExportContext): string {
  const sorted = [...rides].sort((a, b) => a.startT - b.startT);
  return toCsv(
    RIDE_COLUMNS.map((c) => c.name),
    sorted.map((r) => rowOf(RIDE_COLUMNS, r, ctx)),
  );
}

export const POINT_HEADER = ['salida_id', 'dist_m', 'lat', 'lon', 'altitud_gps_m', 'altitud_mapa_m', 'fc'];

/** Filas de puntos.csv de una salida: un punto cada 50 m. Con `hideEnds` salen sin los 300 m de cada punta. */
export function pointRows(rideId: string, points: ProfilePoint[], hideEnds: boolean): (string | number | null)[][] {
  const idx = hideEnds ? shareableIndices(points, HIDE_ENDS_M) : points.map((_, i) => i);
  return idx.map((i) => {
    const p = points[i];
    return [rideId, Math.round(p.d), num(p.lat, 5), num(p.lon, 5), num(p.gps, 1), num(p.dem, 1), num(p.hr, 0)];
  });
}

export function pointsCsv(rows: (string | number | null)[][]): string {
  return toCsv(POINT_HEADER, rows);
}

export function segmentosCsv(rows: SegmentEffortRow[]): string {
  return toCsv(
    ['segmento', 'largo_m', 'salida_id', 'inicio', 'duracion_seg', 'vel_kmh', 'fc_media'],
    rows.map((r) => [r.segmentName, num(r.segmentLengthM, 0), r.rideId, isoLocal(r.startT), num(r.durationSec, 1), num(r.speedMs * 3.6, 2), num(r.avgHr, 0)]),
  );
}

export function metasCsv(goals: Goal[]): string {
  return toCsv(
    ['periodo', 'metrica', 'objetivo', 'unidad'],
    goals.map((g) => {
      const u = GOAL_UNIT[g.metric] ?? { unit: '', div: 1 };
      return [g.period, g.metric, num(g.target / u.div, 2), u.unit];
    }),
  );
}

export function logrosCsv(rows: AwardRow[]): string {
  return toCsv(
    ['clave', 'tipo', 'titulo', 'salida_id', 'fecha'],
    rows.map((a) => [a.key, a.kind, a.title, a.rideId, a.t === null ? null : isoLocal(a.t)]),
  );
}

export function bicisCsv(bikes: BackupBike[], parts: BackupPart[], km: BundleInput['bikeKm']): string {
  const rows: (string | number | boolean | null)[][] = bikes.map((b) => {
    const k = km(b.id);
    return ['bici', b.name, b.type, num(b.weightKg, 1), b.wheel, num(b.tireMm, 0), b.retired, b.isDefault, num(k.km, 1), k.rides, null, null];
  });
  for (const p of parts) {
    const bike = bikes.find((b) => b.id === p.bikeId);
    rows.push(['componente', p.name, null, null, null, null, null, null, null, null, num(p.startKm, 1), bike?.name ?? null]);
  }
  return toCsv(
    ['elemento', 'nombre', 'tipo', 'peso_kg', 'rodado', 'cubierta_mm', 'retirada', 'por_defecto', 'km', 'salidas', 'km_al_ponerlo', 'bici'],
    rows,
  );
}

export function formaDiariaCsv(rides: RideRecord[], hr: HrProfile | null, now: number): string {
  const series = hr ? fitnessSeries(rides, hr, now, 100_000) : [];
  return toCsv(
    ['fecha', 'carga', 'ctl_estado', 'atl_fatiga', 'tsb_forma'],
    series.map((p) => [p.date, num(p.load, 1), num(p.ctl, 1), num(p.atl, 1), num(p.tsb, 1)]),
  );
}

export function perfilCsv(s: Settings, hr: HrProfile | null): string {
  const a = s.athlete;
  const rows: (string | number | null)[][] = [
    ['anio_nacimiento', a.birthYear],
    ['sexo', a.sex],
    ['peso_kg', a.weightKg],
    ['fc_max_lpm', a.hrMax],
    ['fc_reposo_lpm', a.hrRest],
    ['ciudad', s.city ? `${s.city.name}, ${s.city.region}, ${s.city.country}` : null],
  ];
  if (hr) {
    rows.push(['fc_max_usada_lpm', hr.hrMax], ['fc_reposo_usada_lpm', hr.hrRest]);
    for (const z of hrZoneRanges(hr)) rows.push([`zona${z.zone}_desde_lpm`, z.min], [`zona${z.zone}_hasta_lpm`, z.max]);
  }
  return toCsv(['campo', 'valor'], rows);
}

/** El texto que explica el contenido del ZIP: qué es cada archivo, cada columna y cómo usarlo. */
export function leeme(input: { now: number; appVersion: string; includePoints: boolean; hideEnds: boolean; counts: Record<string, number> }): string {
  const { now, appVersion, includePoints, hideEnds, counts } = input;
  return `ASISTENTE CICLISMO — EXPORTACIÓN DE DATOS
Generada el ${isoLocal(now)} con la versión ${appVersion}.

Qué hay en este ZIP
-------------------
  salidas.csv     Una fila por salida (${counts.rides ?? 0}). SIN coordenadas ni nombres de archivo.
  puntos.csv      ${includePoints ? `Un punto cada 50 m de cada salida, CON latitud y longitud${hideEnds ? ' (sin los 300 m del inicio y del final)' : ''}.` : 'No se incluyó (es opcional y está apagado por defecto).'}
  segmentos.csv   Tus tiempos en cada segmento.
  metas.csv       Tus metas (semanales, mensuales y anuales).
  logros.csv      Premios y victorias.
  bicis.csv       Bicis y componentes, con los km de cada una.
  forma_diaria.csv  Estado físico (CTL), fatiga (ATL) y forma (TSB) de cada día.
  perfil.csv      Tu perfil (edad, peso, FC y zonas): son datos de salud.
  respaldo.json   El respaldo completo de la app. INCLUYE LOS RECORRIDOS (coordenadas).

Formato de los CSV
------------------
Separador coma, decimal con punto, UTF-8 con BOM (Excel lo abre bien) y fechas ISO 8601 con huso horario.
Los textos que empiezan con = + - @ llevan una comilla simple adelante para que una planilla no los ejecute.

Qué archivos tienen ubicación
-----------------------------
  puntos.csv y respaldo.json tienen coordenadas. Los demás no. Antes de compartir el ZIP con alguien,
  fijate que no contenga esos archivos si no querés mostrar por dónde andás ni dónde vivís.

Columnas de salidas.csv
-----------------------
${describeColumns(RIDE_COLUMNS)}

Columnas de puntos.csv
----------------------
  salida_id, dist_m (metros desde el inicio), lat, lon, altitud_gps_m, altitud_mapa_m (modelo de terreno), fc (lpm).

Cómo restaurar
--------------
En la app: Ajustes → Tus datos → Importar respaldo, y elegí este ZIP (o respaldo.json). Lo que ya está en el
celular no se pisa. Si el ZIP lo recomprimió otro programa, extraé respaldo.json e importá ese archivo.

Ejemplos de pedidos para una IA (adjuntá salidas.csv)
-----------------------------------------------------
  1. "Con estas salidas, ¿cómo evolucionó mi velocidad media en las salidas de más de 20 km en los últimos 6 meses?"
  2. "Mirá la carga y las zonas de FC de las últimas 8 semanas y decime si estoy entrenando mucho en zona 3."
  3. "Armame un plan para las próximas 4 semanas según mi forma actual (forma_diaria.csv) y mis metas (metas.csv)."
`;
}
