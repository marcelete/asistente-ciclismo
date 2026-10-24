import { readFileSync } from 'fs';
import { join } from 'path';
import { summarizeTrack } from '../../src/core/summary';
import { parseOpenTracksGpx } from '../../src/import/openTracks';

/**
 * Salida grabada con OpenTracks v4.29.0 en el emulador con un GPS simulado: 4 minutos a 7 m/s
 * (25 km/h) hacia el este con una loma de ~20 m, precedidos de ~108 s parado. OpenTracks informó
 * 20 km por saltos de posición provocados al preparar la prueba; la distancia real es ~1,68 km.
 */
const text = readFileSync(join(__dirname, '..', 'fixtures', 'opentracks_emulator.gpx'), 'utf8');

describe('GPX real exportado por OpenTracks v4.29.0 (emulador)', () => {
  const act = parseOpenTracksGpx(text, 'opentracks_emulator.gpx');

  it('se lee completo, con hora, altura (EGM2008), velocidad y precisión', () => {
    expect(act).not.toBeNull();
    expect(act!.samples).toHaveLength(129);
    expect(act!.samples[0]).toMatchObject({ lat: -34.6, alt: 25, speed: 0, acc: 5, hr: null });
    expect(act!.endT - act!.startT).toBe(376244);
  });

  it('el resumen coincide con lo simulado, no con los 20 km que informó OpenTracks', () => {
    const s = summarizeTrack(act!.samples);
    expect(s.distance).toBeGreaterThan(1600);
    expect(s.distance).toBeLessThan(1750);
    expect(s.avgMovingSpeed * 3.6).toBeGreaterThan(24);
    expect(s.avgMovingSpeed * 3.6).toBeLessThan(26.5);
    expect(s.elevationGain).toBeGreaterThan(12);
    expect(s.elevationGain).toBeLessThan(25);
    expect(s.elapsedSec).toBeCloseTo(376.2, 0);
    // El GPS del emulador informa velocidad 0: se usa la derivada de las posiciones.
    expect(s.maxSpeed).toBeGreaterThan(6);
    expect(s.maxSpeed).toBeLessThan(9);
  });
});
