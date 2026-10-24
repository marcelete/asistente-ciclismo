import { decimate, labelEvery, nearestIndex, niceScale } from '../../src/ui/charts/scale';

describe('escalas de los gráficos', () => {
  it('las marcas caen en números redondos que contienen los datos', () => {
    const s = niceScale([12, 487, 233]);
    expect(s.min).toBeLessThanOrEqual(12);
    expect(s.max).toBeGreaterThanOrEqual(487);
    expect(s.ticks).toEqual([0, 200, 400, 600]);
  });

  it('un perfil casi llano no se ve como una montaña', () => {
    const s = niceScale([25, 26, 25.5], { minSpan: 20 });
    expect(s.max - s.min).toBeGreaterThanOrEqual(20);
  });

  it('puede arrancar en cero e ignora los huecos', () => {
    const s = niceScale([null, 18, 31, null], { zero: true });
    expect(s.min).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(31);
    expect(niceScale([null, null])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });

  it('al reducir puntos conserva la cima y el fondo', () => {
    const values = Array.from({ length: 2000 }, (_, i) => Math.sin(i / 50) * 100);
    values[1234] = 500;
    values[777] = -400;
    const idx = decimate(values, 200);
    expect(idx.length).toBeLessThanOrEqual(210);
    expect(idx).toContain(1234);
    expect(idx).toContain(777);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(1999);
    // Con pocos puntos no se toca nada.
    expect(decimate([1, 2, 3], 200)).toEqual([0, 1, 2]);
  });

  it('busca el punto más cercano al dedo', () => {
    const xs = [0, 50, 100, 150];
    expect(nearestIndex(xs, 74)).toBe(1);
    expect(nearestIndex(xs, 76)).toBe(2);
    expect(nearestIndex(xs, -10)).toBe(0);
    expect(nearestIndex(xs, 999)).toBe(3);
    expect(nearestIndex([], 5)).toBe(-1);
  });

  it('muestra todas las etiquetas si entran, si no algunas', () => {
    expect(labelEvery(7, 10)).toBe(1);
    expect(labelEvery(31, 10)).toBe(4);
  });
});
