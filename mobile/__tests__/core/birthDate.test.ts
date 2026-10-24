import { ageOn, birthDateToText, isValidBirthDate, maskBirthDate, parseBirthDate } from '../../src/core/profile/birthDate';
import { sanitizeAthlete } from '../../src/data/settings';

const NOW = new Date(2026, 9, 23, 12).getTime(); // 23/10/2026, hora local

describe('fecha de nacimiento', () => {
  it('la máscara deja solo dígitos y pone las barras', () => {
    expect(maskBirthDate('2')).toBe('2');
    expect(maskBirthDate('250')).toBe('25/0');
    expect(maskBirthDate('25031990')).toBe('25/03/1990');
    expect(maskBirthDate('25/03/1990')).toBe('25/03/1990');
    expect(maskBirthDate('25-03-1990 xx')).toBe('25/03/1990');
    expect(maskBirthDate('250319901234')).toBe('25/03/1990');
  });

  it('lee DD/MM/AAAA y la devuelve como AAAA-MM-DD', () => {
    expect(parseBirthDate('25/03/1990', NOW, 1920, 2016)).toEqual({ iso: '1990-03-25', error: null });
    expect(birthDateToText('1990-03-25')).toBe('25/03/1990');
    expect(birthDateToText(null)).toBe('');
  });

  it('vacío es "no lo cargo"; lo incompleto, inexistente, futuro o fuera de rango da error', () => {
    expect(parseBirthDate('  ', NOW, 1920, 2016)).toEqual({ iso: null, error: null });
    expect(parseBirthDate('25/03', NOW, 1920, 2016).error).not.toBeNull();
    expect(parseBirthDate('31/02/1990', NOW, 1920, 2016).error).toBe('Esa fecha no existe.');
    expect(parseBirthDate('29/02/1991', NOW, 1920, 2016).error).toBe('Esa fecha no existe.');
    expect(parseBirthDate('29/02/1992', NOW, 1920, 2016).iso).toBe('1992-02-29');
    expect(parseBirthDate('01/01/1900', NOW, 1920, 2016).error).toContain('entre 1920 y 2016');
    expect(parseBirthDate('24/10/2026', NOW, 1920, 3000).error).toBe('La fecha no puede ser futura.');
    expect(parseBirthDate('23/10/2026', NOW, 1920, 3000).iso).toBe('2026-10-23');
  });

  it('la edad cuenta los cumpleaños cumplidos', () => {
    expect(ageOn('1990-10-23', NOW)).toBe(36); // cumple hoy
    expect(ageOn('1990-10-24', NOW)).toBe(35); // cumple mañana
    expect(ageOn('1990-01-01', NOW)).toBe(36);
    expect(ageOn('1990-12-31', NOW)).toBe(35);
    expect(ageOn('2030-01-01', NOW)).toBeNull();
    expect(ageOn(null, NOW)).toBeNull();
    expect(ageOn('basura', NOW)).toBeNull();
  });

  it('valida el formato guardado', () => {
    expect(isValidBirthDate('1990-03-25', 1920, 2016)).toBe(true);
    expect(isValidBirthDate('1990-3-25', 1920, 2016)).toBe(false);
    expect(isValidBirthDate('1990-02-30', 1920, 2016)).toBe(false);
    expect(isValidBirthDate(19900325, 1920, 2016)).toBe(false);
    expect(isValidBirthDate('2020-01-01', 1920, 2016)).toBe(false);
  });
});

describe('perfil con fecha de nacimiento', () => {
  it('el año sale de la fecha', () => {
    const a = sanitizeAthlete({ birthDate: '1990-03-25', birthYear: 1970 });
    expect(a.birthDate).toBe('1990-03-25');
    expect(a.birthYear).toBe(1990);
  });

  it('quien cargó solo el año conserva ese año y no tiene fecha', () => {
    const a = sanitizeAthlete({ birthYear: 1980 });
    expect(a.birthDate).toBeNull();
    expect(a.birthYear).toBe(1980);
  });

  it('una fecha inválida se descarta y queda el año, si es válido', () => {
    const a = sanitizeAthlete({ birthDate: '1990-02-30', birthYear: 1985 });
    expect(a.birthDate).toBeNull();
    expect(a.birthYear).toBe(1985);
  });
});
