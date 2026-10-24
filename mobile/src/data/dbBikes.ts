import type { BikeType } from '../core/analysis/profileMetrics';
import type { Bike, BikePart } from '../core/bikes/bikes';
import { conn } from './db';

/** Bicis, componentes y la asignación de bici y "cuenta como salida" de cada salida. */

interface BikeRow {
  id: string;
  name: string;
  type: string;
  weight_kg: number | null;
  wheel: string | null;
  tire_mm: number | null;
  retired: number;
  is_default: number;
  created_t: number;
}

const TYPES: BikeType[] = ['road', 'gravel', 'mtb', 'urban'];

export function loadBikes(): Bike[] {
  return conn()
    .getAllSync<BikeRow>('SELECT * FROM bikes ORDER BY created_t, rowid')
    .map((b) => ({
      id: b.id,
      name: b.name,
      type: TYPES.includes(b.type as BikeType) ? (b.type as BikeType) : 'road',
      weightKg: b.weight_kg,
      wheel: b.wheel,
      tireMm: b.tire_mm,
      retired: b.retired === 1,
      isDefault: b.is_default === 1,
      createdT: b.created_t,
    }));
}

/** Guarda la bici. Si es la primera, queda por defecto; si se marca por defecto, las demás dejan de serlo. */
export async function saveBike(b: Bike): Promise<void> {
  const d = conn();
  d.withTransactionSync(() => {
    const count = d.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM bikes WHERE id != ?', [b.id])?.n ?? 0;
    const isDefault = b.isDefault || count === 0;
    if (isDefault) d.runSync('UPDATE bikes SET is_default = 0 WHERE id != ?', [b.id]);
    d.runSync(
      'INSERT OR REPLACE INTO bikes (id, name, type, weight_kg, wheel, tire_mm, retired, is_default, created_t) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [b.id, b.name, b.type, b.weightKg, b.wheel, b.tireMm, b.retired ? 1 : 0, isDefault ? 1 : 0, b.createdT],
    );
  });
}

/** Borra la bici y sus componentes; sus salidas pasan a usar la bici por defecto. */
export async function deleteBike(id: string): Promise<void> {
  const d = conn();
  d.withTransactionSync(() => {
    d.runSync('UPDATE rides SET bike_id = NULL WHERE bike_id = ?', [id]);
    d.runSync('DELETE FROM bike_parts WHERE bike_id = ?', [id]);
    d.runSync('DELETE FROM bikes WHERE id = ?', [id]);
    // Si era la de por defecto, queda por defecto la primera que siga en uso.
    const hasDefault = d.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM bikes WHERE is_default = 1')?.n ?? 0;
    if (hasDefault === 0) {
      d.runSync('UPDATE bikes SET is_default = 1 WHERE id = (SELECT id FROM bikes WHERE retired = 0 ORDER BY created_t LIMIT 1)');
    }
  });
}

export function loadParts(): BikePart[] {
  return conn()
    .getAllSync<{ id: string; bike_id: string; name: string; start_km: number; start_t: number; alert_km: number | null }>(
      'SELECT * FROM bike_parts ORDER BY start_t',
    )
    .map((p) => ({ id: p.id, bikeId: p.bike_id, name: p.name, startKm: p.start_km, startT: p.start_t, alertKm: p.alert_km }));
}

export async function savePart(p: BikePart): Promise<void> {
  await conn().runAsync(
    'INSERT OR REPLACE INTO bike_parts (id, bike_id, name, start_km, start_t, alert_km) VALUES (?, ?, ?, ?, ?, ?)',
    [p.id, p.bikeId, p.name, p.startKm, p.startT, p.alertKm],
  );
}

export async function deletePart(id: string): Promise<void> {
  await conn().runAsync('DELETE FROM bike_parts WHERE id = ?', [id]);
}

/** Cambia la bici de una salida (null: vuelve a la bici por defecto). */
export async function setRideBike(rideId: string, bikeId: string | null): Promise<void> {
  await conn().runAsync('UPDATE rides SET bike_id = ? WHERE id = ?', [bikeId, rideId]);
}

/** Fuerza que una salida cuente (1) o no cuente (0) como salida en bici; null deja decidir al tipo. */
export async function setCountedOverride(rideId: string, value: 0 | 1 | null): Promise<void> {
  await conn().runAsync('UPDATE rides SET counted_override = ? WHERE id = ?', [value, rideId]);
}

/** Pasa todas las salidas sin bici a la bici indicada (migración de la bici del perfil). */
export async function assignAllRidesToBike(bikeId: string): Promise<void> {
  await conn().runAsync('UPDATE rides SET bike_id = ? WHERE bike_id IS NULL', [bikeId]);
}
