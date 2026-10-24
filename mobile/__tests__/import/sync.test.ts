import type { RideAnalysis } from '../../src/core/analysis/ride';
import { ANALYSIS_VERSION } from '../../src/core/analysis/ride';
import type { ProfilePoint } from '../../src/core/elevation/profile';
import { toGpx } from '../../src/core/io/gpx';
import { syntheticRide } from '../../src/core/sim/synthetic';
import { importSources, MAX_GPX_BYTES, needsReanalysis, reanalyzeRides } from '../../src/import/sync';
import type { GpxSource } from '../../src/import/sync';

const T0 = Date.UTC(2026, 9, 18, 12);
const gpx = (startT: number) => toGpx(syntheticRide({ durationSec: 300, speed: 7, startT, altitudeAt: () => 20 }));

function source(name: string, text: string, size = text.length): GpxSource & { reads: number } {
  const s = { name, size, reads: 0, read: async () => (s.reads++, text) };
  return s;
}

describe('importación de a un archivo', () => {
  it('lee, analiza y guarda cada archivo antes de pasar al siguiente', async () => {
    const order: string[] = [];
    const a = source('a.gpx', gpx(T0));
    const b = source('b.gpx', gpx(T0 + 86400000));
    a.read = async () => (order.push('lee a'), gpx(T0));
    b.read = async () => (order.push('lee b'), gpx(T0 + 86400000));
    const res = await importSources([a, b], {
      saveNew: async (x) => (order.push(`guarda ${x.record.fileName}`), true),
    });
    expect(order).toEqual(['lee a', 'guarda a.gpx', 'lee b', 'guarda b.gpx']);
    expect(res.added).toHaveLength(2);
  });

  it('cuenta los dañados, los enormes y los repetidos sin frenar', async () => {
    const errors: string[] = [];
    const progress: number[] = [];
    const saved = new Set<string>();
    const res = await importSources(
      [
        source('roto.gpx', '<gpx><trk'),
        source('enorme.gpx', '', MAX_GPX_BYTES + 1),
        source('bueno.gpx', gpx(T0)),
        source('copia.gpx', gpx(T0)), // la misma salida con otro nombre
        source('vacio.gpx', '<gpx></gpx>'),
      ],
      {
        saveNew: async (x) => {
          if (saved.has(x.record.id)) return false;
          saved.add(x.record.id);
          return true;
        },
        onError: (what) => errors.push(what),
        onProgress: (done) => progress.push(done),
      },
    );
    expect(res.added.map((r) => r.fileName)).toEqual(['bueno.gpx']);
    expect(res.failed).toBe(2);
    expect(res.skipped).toBe(2);
    expect(errors).toHaveLength(2);
    expect(progress).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('el archivo enorme ni se lee', async () => {
    const big = source('enorme.gpx', 'x', MAX_GPX_BYTES + 1);
    await importSources([big], { saveNew: async () => true });
    expect(big.reads).toBe(0);
  });
});

describe('recálculo de las salidas viejas', () => {
  it('se recalculan las de una versión anterior o sin perfil', () => {
    expect(needsReanalysis({ analysis: 0 }, true)).toBe(true);
    expect(needsReanalysis({ analysis: ANALYSIS_VERSION }, false)).toBe(true);
    expect(needsReanalysis({ analysis: ANALYSIS_VERSION }, true)).toBe(false);
  });

  it('relee el GPX y conserva la altitud del mapa ya consultada', async () => {
    const saved: { a: RideAnalysis; profile: ProfilePoint[] }[] = [];
    const text = gpx(T0);
    const id = `gpx:${T0}`;
    const old: ProfilePoint[] = [{ d: 0, lat: -34.6, lon: -58.4, gps: 20, dem: 33, t: null, hr: null }];
    const n = await reanalyzeRides(
      [
        { id, fileName: 'a.gpx' },
        { id: 'gpx:1', fileName: 'borrado.gpx' }, // ya no está en la carpeta
      ],
      new Map([['a.gpx', source('a.gpx', text)]]),
      {
        loadProfile: () => old,
        saveReanalysis: async (a, profile) => {
          saved.push({ a, profile });
        },
      },
    );
    expect(n).toBe(1);
    expect(saved[0].a.record).toMatchObject({ id, analysis: ANALYSIS_VERSION });
    expect(saved[0].profile[0].dem).toBe(33);
    expect(saved[0].profile[0].t).toBe(0);
    expect(saved[0].profile[1].dem).toBeNull();
  });

  it('no pisa una salida con el GPX de otra', async () => {
    const saveReanalysis = jest.fn();
    const n = await reanalyzeRides([{ id: 'gpx:999', fileName: 'a.gpx' }], new Map([['a.gpx', source('a.gpx', gpx(T0))]]), {
      loadProfile: () => null,
      saveReanalysis,
    });
    expect(n).toBe(0);
    expect(saveReanalysis).not.toHaveBeenCalled();
  });
});
