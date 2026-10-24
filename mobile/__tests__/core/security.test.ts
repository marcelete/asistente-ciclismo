import { fillPrivacyZone, PRIVACY_ZONE_M, shareableIndices } from '../../src/core/elevation/privacy';
import type { ProfilePoint } from '../../src/core/elevation/profile';
import { parseGpx, toGpx } from '../../src/core/io/gpx';
import { describeError, MAX_LOG_LENGTH, redact } from '../../src/core/log/redact';
import { syntheticRide } from '../../src/core/sim/synthetic';
import { unpackProfile } from '../../src/data/profileCodec';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/data/settings';
import { importFiles } from '../../src/import/openTracks';

describe('redacción del registro', () => {
  it('quita coordenadas, URIs y nombres de GPX', () => {
    const out = redact(
      'Falló content://com.android.externalstorage/tree/primary%3AOpenTracks en 2026-10-19T13-54.gpx cerca de -34.60312,-58.38157',
    );
    expect(out).not.toMatch(/OpenTracks|13-54|34\.60|58\.38/);
    expect(out).toContain('content://[oculto]');
    expect(out).toContain('[archivo].gpx');
    expect(out).toContain('[coord]');
  });

  it('deja números comunes y corta los mensajes largos', () => {
    expect(redact('Open-Meteo respondió 503 en 1.5 s')).toBe('Open-Meteo respondió 503 en 1.5 s');
    expect(redact('x'.repeat(2000)).length).toBe(MAX_LOG_LENGTH + 1);
    expect(describeError(new TypeError('file:///data/user/0/x.db'))).toBe('TypeError: file://[oculto]');
  });
});

describe('ajustes guardados', () => {
  it('usa los valores por defecto ante datos inválidos', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({
      autoPause: 'sí',
      reminders: { enabled: true, hour: 27, minute: 30.5 },
      folderUri: 'http://evil',
      demOnline: false,
    });
    expect(s.autoPause).toBe(true);
    expect(s.reminders).toMatchObject({ enabled: true, hour: 19, minute: 0 });
    expect(s.folderUri).toBeNull();
    expect(s.demOnline).toBe(false);
  });

  it('conserva los válidos', () => {
    const s = sanitizeSettings({ folderUri: 'content://tree/x', reminders: { hour: 7, minute: 30 } });
    expect(s.folderUri).toBe('content://tree/x');
    expect(s.reminders).toMatchObject({ hour: 7, minute: 30 });
  });
});

describe('zona privada de la altitud del mapa', () => {
  const pts: ProfilePoint[] = Array.from({ length: 41 }, (_, i) => ({
    d: i * 50,
    lat: -34 - i * 1e-4,
    lon: -58,
    gps: 20 + i,
    dem: null,
    t: i * 10,
    hr: null,
  }));

  it('no comparte los primeros ni los últimos metros', () => {
    const idx = shareableIndices(pts);
    expect(idx.length).toBeGreaterThan(0);
    for (const i of idx) {
      expect(pts[i].d).toBeGreaterThanOrEqual(PRIVACY_ZONE_M);
      expect(pts[i].d).toBeLessThanOrEqual(2000 - PRIVACY_ZONE_M);
    }
  });

  it('completa la zona siguiendo el GPS, empalmado con el mapa', () => {
    const idx = new Set(shareableIndices(pts));
    const fetched = pts.map((p, i) => (idx.has(i) ? { ...p, dem: p.gps! + 10 } : p));
    const filled = fillPrivacyZone(fetched);
    expect(filled.every((p) => p.dem !== null)).toBe(true);
    filled.forEach((p) => expect(p.dem).toBeCloseTo(p.gps! + 10));
  });

  it('en una salida muy corta usa el GPS', () => {
    const short = pts.slice(0, 5);
    expect(shareableIndices(short)).toEqual([]);
    expect(fillPrivacyZone(short).map((p) => p.dem)).toEqual(short.map((p) => p.gps));
  });
});

describe('perfil guardado', () => {
  it('lee un perfil válido, del formato viejo y del nuevo', () => {
    expect(unpackProfile('[[0,-34.6,-58.4,25,null]]')).toEqual([
      { d: 0, lat: -34.6, lon: -58.4, gps: 25, dem: null, t: null, hr: null },
    ]);
    expect(unpackProfile('[[50,-34.6,-58.4,25,27.5,12.3,141]]')).toEqual([
      { d: 50, lat: -34.6, lon: -58.4, gps: 25, dem: 27.5, t: 12.3, hr: 141 },
    ]);
  });

  it('devuelve null si está dañado en vez de lanzar', () => {
    expect(unpackProfile('{roto')).toBeNull();
    expect(unpackProfile('{"a":1}')).toBeNull();
    expect(unpackProfile('[[0,"x",1,null,null]]')).toBeNull();
    expect(unpackProfile('[[0,1]]')).toBeNull();
    expect(unpackProfile('[[0,1,2,null,null,"x",null]]')).toBeNull();
  });
});

describe('GPX no confiables', () => {
  const text = toGpx(syntheticRide({ durationSec: 120, speed: 6 }));

  it('un archivo dañado no frena a los demás', () => {
    const errors: string[] = [];
    const list = importFiles(
      [
        // Cortado a mitad de una etiqueta, como un GPX que OpenTracks todavía está escribiendo.
        { name: 'roto.gpx', text: '<gpx><trk' },
        { name: 'bueno.gpx', text },
      ],
      (name) => errors.push(name),
    );
    expect(list.map((a) => a.record.fileName)).toEqual(['bueno.gpx']);
    expect(errors).toEqual(['roto.gpx']);
  });

  it('no expande entidades XML', () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>
      <gpx><trk><trkseg><trkpt lat="1" lon="2"><time>&b;</time></trkpt></trkseg></trk></gpx>`;
    expect(parseGpx(bomb)).toEqual([]);
  });

  it('descarta fechas imposibles y coordenadas fuera de rango', () => {
    const gpx = `<gpx><trk><trkseg>
      <trkpt lat="1" lon="2"><time>1970-01-01T00:00:00Z</time></trkpt>
      <trkpt lat="95" lon="2"><time>2026-10-19T10:00:00Z</time></trkpt>
      <trkpt lat="1" lon="2"><time>2026-10-19T10:00:01Z</time></trkpt>
    </trkseg></trk></gpx>`;
    expect(parseGpx(gpx)).toHaveLength(1);
  });
});
