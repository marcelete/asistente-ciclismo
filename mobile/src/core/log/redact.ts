/** Largo máximo de un mensaje del registro, para que un error enorme no llene la base. */
export const MAX_LOG_LENGTH = 500;

/**
 * Quita del texto de un registro lo que puede identificar a la persona o dónde anda: URIs de
 * archivos y carpetas, nombres de GPX y números con forma de coordenada (4 o más decimales).
 * Se aplica a todo mensaje antes de guardarlo o mostrarlo.
 */
export function redact(text: string): string {
  const out = text
    .replace(/\b(content|file):\/\/\S+/gi, '$1://[oculto]')
    // URLs de mosaicos de mapa: la posición del mosaico dice qué zona se miraba.
    .replace(/https?:\/\/\S*(?:tile|cyclosm)\S*/gi, '[mosaico]')
    // Parámetros de consultas a Open-Meteo: ubicación, fechas y lo que se buscó.
    .replace(/\b(latitude|longitude|start_date|end_date|name)=[^&\s'"`)]*/gi, '$1=[oculto]')
    .replace(/[^\s/\\'"`()]+\.gpx\b/gi, '[archivo].gpx')
    .replace(/-?\d{1,3}\.\d{4,}/g, '[coord]');
  return out.length > MAX_LOG_LENGTH ? `${out.slice(0, MAX_LOG_LENGTH)}…` : out;
}

/** Texto de un error cualquiera, ya sin datos personales. */
export function describeError(e: unknown): string {
  if (e instanceof Error) return redact(`${e.name}: ${e.message}`);
  return redact(String(e));
}
