import { toGpx } from '../../src/core/io/gpx';
import { syntheticRide } from '../../src/core/sim/synthetic';
import { importFiles, parseOpenTracksGpx } from '../../src/import/openTracks';

describe('importación de GPX de OpenTracks', () => {
  const ride = syntheticRide({ durationSec: 300, speed: 7, hr: 140, altitudeAt: (d) => 30 + d * 0.01 });
  const text = toGpx(ride, 'Salida de prueba');

  it('convierte un GPX en una actividad con id estable', () => {
    const a = parseOpenTracksGpx(text, 'a.gpx');
    expect(a).not.toBeNull();
    expect(a?.id).toBe(`gpx:${ride[0].t}`);
    expect(a?.samples).toHaveLength(ride.length);
  });

  it('descarta archivos vacíos, no GPX y duplicados', () => {
    const list = importFiles([
      { name: 'a.gpx', text },
      { name: 'copia.gpx', text }, // misma salida
      { name: 'b.kmz', text }, // otra extensión
      { name: 'vacio.gpx', text: '<gpx></gpx>' },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].record.distance).toBeGreaterThan(2000);
  });

  it('ordena de la más reciente a la más antigua', () => {
    const older = syntheticRide({ durationSec: 120, speed: 6, startT: ride[0].t - 86400000 });
    const list = importFiles([
      { name: 'vieja.gpx', text: toGpx(older) },
      { name: 'nueva.gpx', text },
    ]);
    expect(list.map((x) => x.record.fileName)).toEqual(['nueva.gpx', 'vieja.gpx']);
  });
});
