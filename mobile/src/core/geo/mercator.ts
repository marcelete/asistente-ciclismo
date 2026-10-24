/** Proyección Web Mercator con mosaicos de 256 px (la que usan OpenStreetMap y casi todos los mapas). */
export const TILE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 18;

export interface WorldPx {
  x: number;
  y: number;
}

const MAX_LAT = 85.0511;

/** Posición en píxeles del mundo entero a ese zoom. */
export function project(lat: number, lon: number, zoom: number): WorldPx {
  const la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const scale = TILE * 2 ** zoom;
  const x = ((lon + 180) / 360) * scale;
  const s = Math.sin((la * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export function unproject(px: WorldPx, zoom: number): { lat: number; lon: number } {
  const scale = TILE * 2 ** zoom;
  const lon = (px.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * px.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

export interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/** El zoom entero más grande en que el rectángulo entra en la vista, y su centro. */
export function fitBounds(b: BBox, width: number, height: number, padding = 24): { zoom: number; center: { lat: number; lon: number } } {
  const w = Math.max(1, width - padding * 2);
  const h = Math.max(1, height - padding * 2);
  let zoom = MAX_ZOOM;
  for (; zoom > MIN_ZOOM; zoom--) {
    const a = project(b.maxLat, b.minLon, zoom);
    const c = project(b.minLat, b.maxLon, zoom);
    if (c.x - a.x <= w && c.y - a.y <= h) break;
  }
  return { zoom, center: { lat: (b.minLat + b.maxLat) / 2, lon: (b.minLon + b.maxLon) / 2 } };
}

export interface VisibleTile {
  z: number;
  x: number;
  y: number;
  /** Esquina superior izquierda del mosaico en pantalla. */
  left: number;
  top: number;
}

/** Mosaicos que cubren una vista de `width`×`height` centrada en `center` (en px del mundo a ese zoom). */
export function visibleTiles(center: WorldPx, zoom: number, width: number, height: number): VisibleTile[] {
  const n = 2 ** zoom;
  const x0 = Math.floor((center.x - width / 2) / TILE);
  const x1 = Math.floor((center.x + width / 2) / TILE);
  const y0 = Math.max(0, Math.floor((center.y - height / 2) / TILE));
  const y1 = Math.min(n - 1, Math.floor((center.y + height / 2) / TILE));
  const out: VisibleTile[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      out.push({
        z: zoom,
        x: ((tx % n) + n) % n,
        y: ty,
        left: tx * TILE - center.x + width / 2,
        top: ty * TILE - center.y + height / 2,
      });
    }
  }
  return out;
}
