/**
 * ZIP sin compresión ("store"), el mínimo que abren Windows, macOS y Android. Alcanza para los CSV
 * y el respaldo: son texto y la compresión no vale el código extra. Los nombres van en UTF-8.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (table) return table;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  table = t;
  return t;
}

/** CRC-32 (el de ZIP y PNG). El de "123456789" es CBF43926. */
export function crc32(data: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha y hora en el formato de MS-DOS que usa ZIP (años desde 1980, segundos de a dos). */
function dosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(ms);
  const year = Math.min(2107, Math.max(1980, d.getFullYear()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const UTF8_FLAG = 0x0800;

/** Arma un ZIP con los archivos tal cual (sin comprimir). */
export function zipStore(entries: ZipEntry[], now: number = Date.now()): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const names = entries.map((e) => enc.encode(e.name));
  let size = 22;
  entries.forEach((e, i) => {
    size += 30 + names[i].length + e.data.length + 46 + names[i].length;
  });
  if (size > 0xffffffff || entries.length > 0xffff) throw new Error('El ZIP es demasiado grande');

  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  let pos = 0;
  const offsets: number[] = [];
  const crcs: number[] = [];

  entries.forEach((e, i) => {
    const crc = crc32(e.data);
    crcs.push(crc);
    offsets.push(pos);
    v.setUint32(pos, 0x04034b50, true);
    v.setUint16(pos + 4, 20, true); // versión necesaria
    v.setUint16(pos + 6, UTF8_FLAG, true);
    v.setUint16(pos + 8, 0, true); // método: sin compresión
    v.setUint16(pos + 10, time, true);
    v.setUint16(pos + 12, date, true);
    v.setUint32(pos + 14, crc, true);
    v.setUint32(pos + 18, e.data.length, true);
    v.setUint32(pos + 22, e.data.length, true);
    v.setUint16(pos + 26, names[i].length, true);
    v.setUint16(pos + 28, 0, true);
    out.set(names[i], pos + 30);
    out.set(e.data, pos + 30 + names[i].length);
    pos += 30 + names[i].length + e.data.length;
  });

  const dirStart = pos;
  entries.forEach((e, i) => {
    v.setUint32(pos, 0x02014b50, true);
    v.setUint16(pos + 4, 20, true); // versión con que se creó
    v.setUint16(pos + 6, 20, true);
    v.setUint16(pos + 8, UTF8_FLAG, true);
    v.setUint16(pos + 10, 0, true);
    v.setUint16(pos + 12, time, true);
    v.setUint16(pos + 14, date, true);
    v.setUint32(pos + 16, crcs[i], true);
    v.setUint32(pos + 20, e.data.length, true);
    v.setUint32(pos + 24, e.data.length, true);
    v.setUint16(pos + 28, names[i].length, true);
    // 30 extra, 32 comentario, 34 disco, 36 atributos internos, 38 externos: todo en cero.
    v.setUint32(pos + 42, offsets[i], true);
    out.set(names[i], pos + 46);
    pos += 46 + names[i].length;
  });

  v.setUint32(pos, 0x06054b50, true);
  v.setUint16(pos + 8, entries.length, true);
  v.setUint16(pos + 10, entries.length, true);
  v.setUint32(pos + 12, pos - dirStart, true);
  v.setUint32(pos + 16, dirStart, true);
  return out;
}

/** El archivo empieza como un ZIP ("PK"). */
export function looksLikeZip(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;
}

export class ZipCompressedError extends Error {
  constructor() {
    super('El ZIP está comprimido (alguien lo volvió a guardar). Importá respaldo.json directamente.');
    this.name = 'ZipCompressedError';
  }
}

/**
 * Lee un ZIP armado por `zipStore`. Si trae archivos comprimidos (porque lo recomprimió otro
 * programa) lanza `ZipCompressedError`: el usuario puede extraer `respaldo.json` e importarlo.
 */
export function unzipStore(data: Uint8Array): ZipEntry[] {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('No es un ZIP válido');
  const count = v.getUint16(eocd + 10, true);
  let pos = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (pos + 46 > data.length || v.getUint32(pos, true) !== 0x02014b50) throw new Error('El ZIP está dañado');
    const method = v.getUint16(pos + 10, true);
    const crc = v.getUint32(pos + 16, true);
    const csize = v.getUint32(pos + 20, true);
    const usize = v.getUint32(pos + 24, true);
    const nameLen = v.getUint16(pos + 28, true);
    const extraLen = v.getUint16(pos + 30, true);
    const commentLen = v.getUint16(pos + 32, true);
    const local = v.getUint32(pos + 42, true);
    const name = dec.decode(data.subarray(pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;
    if (method !== 0 || csize !== usize) throw new ZipCompressedError();
    if (local + 30 > data.length || v.getUint32(local, true) !== 0x04034b50) throw new Error('El ZIP está dañado');
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (start + usize > data.length) throw new Error('El ZIP está incompleto');
    const bytes = data.subarray(start, start + usize);
    if (crc32(bytes) !== crc) throw new Error(`El archivo ${name} del ZIP está dañado`);
    out.push({ name, data: bytes });
  }
  return out;
}
