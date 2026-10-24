import { PRIVACY_ZONE_M } from '../../src/core/elevation/privacy';
import type { ProfilePoint } from '../../src/core/elevation/profile';
import { fetchDemProfile } from '../../src/services/elevation';

// La caché y el cliente con presupuesto usan la base: acá se reemplazan por versiones simples.
jest.mock('../../src/data/dbDem', () => ({ getCells: () => new Map(), putCells: async () => {} }));
jest.mock('../../src/services/openMeteo', () => {
  const { OpenMeteoWait, OpenMeteoCancelled } = jest.requireActual('../helpers/openMeteoMock');
  return { OpenMeteoWait, OpenMeteoCancelled, omGet: async (url: string) => (await fetch(url)).json() };
});

/** 3 km de salida, un punto cada 50 m. */
const points: ProfilePoint[] = Array.from({ length: 61 }, (_, i) => ({
  d: i * 50,
  lat: -34.6 - i * 0.00045,
  lon: -58.4,
  gps: 20,
  dem: null,
  t: i * 7,
  hr: null,
}));

function mockFetch() {
  const calls: string[] = [];
  const fn = jest.fn(async (url: string) => {
    calls.push(url);
    const n = new URL(url).searchParams.get('latitude')!.split(',').length;
    return { ok: true, status: 200, json: async () => ({ elevation: new Array(n).fill(30) }) } as unknown as Response;
  });
  global.fetch = fn as unknown as typeof fetch;
  return { fn, calls };
}

describe('consulta de altitud del mapa', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('no manda la zona privada y redondea las coordenadas', async () => {
    const { calls } = mockFetch();
    const { points: out } = await fetchDemProfile(points);
    const sent = calls.flatMap((u) => new URL(u).searchParams.get('latitude')!.split(','));
    // Ni el inicio ni el final, y con 4 decimales.
    expect(sent.length).toBeLessThanOrEqual(points.filter((p) => p.d >= PRIVACY_ZONE_M && p.d <= 3000 - PRIVACY_ZONE_M).length);
    expect(sent.every((s) => /^-\d+\.\d{4}$/.test(s))).toBe(true);
    expect(out.every((p) => p.dem !== null)).toBe(true);
  });

  it('solo pide los puntos que todavía no tienen altitud', async () => {
    const { calls } = mockFetch();
    const partial = points.map((p, i) => (i < 30 ? { ...p, dem: 25 } : p));
    await fetchDemProfile(partial);
    const sent = calls.flatMap((u) => new URL(u).searchParams.get('latitude')!.split(','));
    expect(sent.length).toBeLessThanOrEqual(partial.filter((p) => p.dem === null && p.d >= PRIVACY_ZONE_M && p.d <= 3000 - PRIVACY_ZONE_M).length);
    // Con todo completo no sale nada.
    calls.length = 0;
    await fetchDemProfile(points.map((p) => ({ ...p, dem: 25 })));
    expect(calls).toHaveLength(0);
  });

  it('si apagás la consulta, no sale ninguna tanda más', async () => {
    const { fn } = mockFetch();
    const res = await fetchDemProfile(points, () => true);
    expect(res.cancelled).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });
});
