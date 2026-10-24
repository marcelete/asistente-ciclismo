import {
  formatChange,
  formatDuration,
  formatEffortDistance,
  formatRemaining,
  formatHours,
  formatKm,
  formatKmh,
  formatMeters,
  formatNumber,
  formatRideDate,
  parseDecimal,
} from '../../src/ui/format';

describe('format', () => {
  it('velocidad en km/h con coma decimal', () => {
    expect(formatKmh(25 / 3.6)).toBe('25,0');
    expect(formatKmh(0)).toBe('0,0');
  });

  it('distancia en km, con menos decimales en los totales grandes', () => {
    expect(formatKm(4170)).toBe('4,17');
    expect(formatKm(0)).toBe('0,00');
    expect(formatKm(142_540)).toBe('142,5');
    expect(formatKm(1_234_567)).toBe('1.235');
  });

  it('duración con y sin horas', () => {
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('metros con separador de miles y guiones si no hay dato', () => {
    expect(formatMeters(1234.4)).toBe('1.234');
    expect(formatMeters(87)).toBe('87');
    expect(formatMeters(null)).toBe('--');
    expect(formatMeters(-3)).toBe('-3');
  });

  it('nunca muestra NaN', () => {
    expect(formatKmh(NaN)).toBe('--');
    expect(formatKm(Infinity)).toBe('--');
    expect(formatMeters(NaN)).toBe('--');
    expect(formatDuration(NaN)).toBe('--');
    expect(formatHours(NaN)).toBe('--');
    expect(formatNumber(-0.01, 1)).toBe('0,0');
  });

  it('fecha de la salida relativa a hoy', () => {
    const now = new Date(2026, 9, 21, 20).getTime();
    expect(formatRideDate(new Date(2026, 9, 21, 18, 5).getTime(), now)).toBe('Hoy · 18:05');
    expect(formatRideDate(new Date(2026, 9, 20, 7, 30).getTime(), now)).toBe('Ayer · 07:30');
    expect(formatRideDate(new Date(2026, 9, 19, 18, 5).getTime(), now)).toBe('lun 19/10 · 18:05');
    expect(formatRideDate(new Date(2025, 9, 19, 18, 5).getTime(), now)).toBe('19/10/2025 · 18:05');
  });

  it('variación frente al período anterior, sin signo repetido', () => {
    expect(formatChange(112, 100)).toEqual({ text: '12 %', dir: 'up' });
    expect(formatChange(50, 100)).toEqual({ text: '50 %', dir: 'down' });
    expect(formatChange(100, 100)).toEqual({ text: '0 %', dir: 'same' });
    expect(formatChange(3000, 100)).toEqual({ text: '2.900 %', dir: 'up' });
    expect(formatChange(10, 0)).toBeNull();
  });

  it('distancias de los mejores tiempos', () => {
    expect(formatEffortDistance(1000)).toBe('1 km');
    expect(formatEffortDistance(100000)).toBe('100 km');
  });

  it('lee cantidades con coma, punto o punto de miles', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal('1.500')).toBe(1500);
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal(' 80 ')).toBe(80);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('12a')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('-5')).toBeNull();
  });
});

describe('formatRemaining', () => {
  it('las cuentas van en singular o plural y sin decimales', () => {
    expect(formatRemaining(1, 'salidas')).toBe('Te falta 1 salida');
    expect(formatRemaining(3, 'días')).toBe('Te faltan 3 días');
    expect(formatRemaining(4, 'semanas')).toBe('Te faltan 4 semanas');
    expect(formatRemaining(0.2, 'metas')).toBe('Te falta 1 meta');
    expect(formatRemaining(2.4, 'récords')).toBe('Te faltan 3 récords');
    expect(formatRemaining(1234, 'salidas')).toBe('Te faltan 1.234 salidas');
  });

  it('las medidas llevan un decimal si faltan menos de 10', () => {
    expect(formatRemaining(100, 'km')).toBe('Te faltan 100 km');
    expect(formatRemaining(4.56, 'km')).toBe('Te faltan 4,6 km');
    expect(formatRemaining(1000, 'm')).toBe('Te faltan 1.000 m');
  });

  it('no muestra negativos ni NaN', () => {
    expect(formatRemaining(-5, 'km')).toBe('Te faltan 0,0 km');
    expect(formatRemaining(Number.NaN, 'km')).toBe('--');
  });
});
