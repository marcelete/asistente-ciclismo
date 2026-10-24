import { parseGpx, toGpx } from '../../src/core/io/gpx';
import { syntheticRide } from '../../src/core/sim/synthetic';
import { summarizeTrack } from '../../src/core/summary';

describe('GPX', () => {
  it('lee puntos con hora, altitud y FC de la extensión de Garmin', () => {
    const xml = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <trk><trkseg>
  <trkpt lat="-34.6" lon="-58.4"><ele>25.5</ele><time>2026-10-18T12:00:00Z</time>
    <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>131</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  <trkpt lat="-34.6" lon="-58.3999"><ele>26</ele><time>2026-10-18T12:00:01Z</time></trkpt>
  <trkpt lat="-34.6" lon="-58.3998"><ele>26</ele></trkpt>
 </trkseg></trk></gpx>`;
    const s = parseGpx(xml);
    expect(s).toHaveLength(2); // el tercero no tiene hora
    expect(s[0]).toMatchObject({ lat: -34.6, lon: -58.4, alt: 25.5, hr: 131 });
    expect(s[1].t - s[0].t).toBe(1000);
    expect(s[1].hr).toBeNull();
  });

  it('lee FC, velocidad y precisión del esquema v2 de TrackPointExtension', () => {
    const xml = `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v2">
 <trk><trkseg>
  <trkpt lat="-34.6" lon="-58.4"><ele>30</ele><time>2026-10-18T12:00:00.000Z</time>
   <extensions><gpxtpx:TrackPointExtension>
     <gpxtpx:hr>142</gpxtpx:hr><gpxtpx:speed>7.25</gpxtpx:speed><gpxtpx:hacc>4.5</gpxtpx:hacc>
   </gpxtpx:TrackPointExtension></extensions></trkpt>
 </trkseg></trk></gpx>`;
    const [p] = parseGpx(xml);
    expect(p).toMatchObject({ hr: 142, speed: 7.25, acc: 4.5, alt: 30 });
  });

  it('exportar y volver a leer conserva la salida', () => {
    const ride = syntheticRide({ durationSec: 120, speed: 7, hr: 140, altitudeAt: (d) => 20 + d * 0.01 });
    const back = parseGpx(toGpx(ride));
    expect(back).toHaveLength(ride.length);
    expect(back[60].hr).toBe(140);
    expect(back[60].lat).toBeCloseTo(ride[60].lat, 6);
    const a = summarizeTrack(ride);
    const b = summarizeTrack(back);
    expect(b.distance).toBeCloseTo(a.distance, 0);
  });

  it('un archivo vacío o sin trazas da una lista vacía', () => {
    expect(parseGpx('<gpx></gpx>')).toEqual([]);
  });
});
