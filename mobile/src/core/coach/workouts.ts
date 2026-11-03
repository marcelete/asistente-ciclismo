import type { TrainSport } from '../stats/sport';
import type { Block, Intensity, Level, WorkoutDef, WorkoutKind, WorkoutWhere } from './types';

/**
 * Biblioteca de sesiones. Cada una arma sus bloques para la duración que pida el plan: el
 * calentamiento y la vuelta a la calma son fijos y lo que sobra se llena con el trabajo.
 */

const sec = (min: number) => Math.round(min * 60);
const z = (zone: 1 | 2 | 3 | 4 | 5): Intensity => ({ type: 'zone', zone });
const ftp = (min: number, max: number): Intensity => ({ type: 'ftp', min, max });
const rpe = (min: number, max: number): Intensity => ({ type: 'rpe', min, max });

const warm = (min: number, cue?: string): Block => ({ label: 'Calentamiento', role: 'warmup', durationSec: sec(min), intensity: z(1), cue });
const cool = (min: number): Block => ({ label: 'Vuelta a la calma', role: 'cooldown', durationSec: sec(min), intensity: z(1), cue: 'Aflojá y pedaleá suave.' });
const work = (label: string, min: number, intensity: Intensity, cue?: string): Block => ({ label, role: 'work', durationSec: sec(min), intensity, cue });
const rest = (label: string, min: number, intensity: Intensity = z(1)): Block => ({ label, role: 'recovery', durationSec: sec(min), intensity });

/** Repite un trabajo y su pausa `n` veces; la última pausa se omite. */
function sets(n: number, w: (i: number) => Block, r: (i: number) => Block): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < n; i++) {
    out.push(w(i));
    if (i < n - 1) out.push(r(i));
  }
  return out;
}

/** Cuántas repeticiones entran en el tiempo útil, con un mínimo. */
const fit = (usefulMin: number, cycleMin: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(usefulMin / cycleMin)));

function steady(label: string, totalMin: number, intensity: Intensity, cue?: string): Block[] {
  return [warm(10), work(label, Math.max(5, totalMin - 15), intensity, cue), cool(5)];
}

/** Circuito por estaciones: `rounds` vueltas de ejercicios con tiempo de trabajo y pausa. */
function circuit(exercises: string[], workSec: number, restSec: number, rounds: number, intensity: Intensity, cue?: string): Block[] {
  const out: Block[] = [];
  for (let r = 0; r < rounds; r++) {
    for (const [i, name] of exercises.entries()) {
      out.push({ label: name, role: 'work', durationSec: workSec, intensity, cue: r === 0 ? cue : undefined });
      const last = r === rounds - 1 && i === exercises.length - 1;
      if (!last) out.push({ label: 'Pausa', role: 'recovery', durationSec: restSec, intensity: { type: 'free' } });
    }
  }
  return out;
}

const def = (
  id: string,
  name: string,
  kind: WorkoutKind,
  where: WorkoutWhere,
  minLevel: Level,
  [minMin, maxMin]: [number, number],
  preparations: WorkoutDef['preparations'],
  density: string | null,
  description: string,
  build: (totalMin: number) => Block[],
): WorkoutDef => ({ id, name, kind, where, preparations, minLevel, minMin, maxMin, density, description, build });

export const WORKOUTS: WorkoutDef[] = [
  def('recup-suave', 'Recuperación suave', 'recovery', 'bike', 0, [20, 75], ['fisica'], null, 'Pedaleo muy liviano para drenar la fatiga. Que se pueda charlar.', (m) => [
    warm(5),
    work('Pedaleo suave', Math.max(5, m - 10), z(1), 'Cadencia alta y sin apuro.'),
    cool(5),
  ]),
  def('fondo-z2', 'Fondo en zona 2', 'endurance', 'bike', 0, [40, 180], ['fisica', 'psicologica'], null, 'Base aeróbica: ritmo parejo y conversable.', (m) => steady('Fondo zona 2', m, z(2), 'Respirá por la nariz si podés.')),
  def('fondo-cadencia', 'Fondo con cadencia', 'endurance', 'bike', 0, [45, 150], ['fisica', 'tecnica'], '1:4', 'Fondo en zona 2 con 1 minuto de cadencia alta cada 5.', (m) => {
    const n = fit(m - 15, 5, 3, 20);
    return [warm(10), ...sets(n, () => work('Cadencia alta', 1, z(2), 'Subí a 100 pedaleos por minuto, sin rebotar.'), () => rest('Cadencia normal', 4, z(2))), cool(5)];
  }),
  def('fondo-largo', 'Salida larga', 'long', 'bike', 0, [75, 420], ['fisica', 'tactica', 'psicologica'], null, 'Salida larga en zona 2. Practicá comer y tomar sin que te lo pida el cuerpo.', (m) => steady('Ritmo largo zona 2', m, z(2), 'Tomá agua cada 15 minutos y comé algo cada 45.')),
  def('largo-progresivo', 'Salida larga progresiva', 'long', 'bike', 1, [90, 360], ['fisica', 'tactica'], null, 'Empieza en zona 2 y termina en zona 3: terminar más fuerte de lo que arrancaste.', (m) => {
    const useful = m - 15;
    const a = Math.round(useful * 0.7);
    return [warm(10), work('Zona 2', a, z(2), 'Guardá fuerzas para el final.'), work('Zona 3 final', useful - a, z(3), 'Ahora sí, subí un escalón.'), cool(5)];
  }),
  def('tempo-continuo', 'Tempo continuo', 'tempo', 'bike', 0, [45, 120], ['fisica'], null, 'Un bloque sostenido en zona 3, firme pero controlado.', (m) => steady('Tempo zona 3', m, z(3), 'Firme y parejo, sin picos.')),
  def('tempo-2x15', 'Tempo 2×15', 'tempo', 'bike', 1, [60, 120], ['fisica'], '3:1', 'Dos bloques de tempo con pausa corta.', (m) => {
    const n = fit(m - 15, 20, 2, 4);
    return [warm(10), ...sets(n, () => work('Tempo', 15, z(3), 'Respiración marcada pero estable.'), () => rest('Pausa', 5)), cool(5)];
  }),
  def('ritmo-constante', 'Ritmo constante en bloques de 8', 'steady', 'bike', 0, [50, 120], ['fisica', 'tecnica'], '2:1', 'Mantener la velocidad dentro de la banda: la técnica de pedalear parejo.', (m) => {
    const n = fit(m - 15, 12, 3, 6);
    return [warm(10), ...sets(n, (i) => work(`Bloque ${i + 1}`, 8, ftp(0.7, 0.8), 'Elegí una velocidad y no la sueltes.'), () => rest('Pausa', 4)), cool(5)];
  }),
  def('ritmo-constante-largo', 'Ritmo constante en bloques de 20', 'steady', 'bike', 1, [65, 100], ['fisica', 'tecnica', 'tactica'], '4:1', 'Dos bloques largos a ritmo de evento, parejos de principio a fin.', (m) => {
    const n = fit(m - 15, 25, 2, 3);
    return [warm(10), ...sets(n, (i) => work(`Bloque ${i + 1}`, 20, ftp(0.72, 0.82), 'Los últimos minutos tienen que ser iguales a los primeros.'), () => rest('Pausa', 5)), cool(5)];
  }),
  def('umbral-2x20', 'Umbral 2×20', 'threshold', 'bike', 1, [65, 130], ['fisica', 'psicologica'], '4:1', 'Dos bloques en el umbral. Duro y sostenido.', (m) => {
    const n = fit(m - 15, 25, 2, 3);
    return [warm(10, 'Hoy toca duro: entrá en calor bien.'), ...sets(n, (i) => work(`Umbral ${i + 1}`, 20, ftp(0.91, 1.0), 'Pensá en el próximo minuto, no en el bloque entero.'), () => rest('Pausa', 5)), cool(5)];
  }),
  def('umbral-3x10', 'Umbral 3×10', 'threshold', 'bike', 1, [55, 110], ['fisica'], '2:1', 'Tres bloques de 10 minutos en el umbral.', (m) => {
    const n = fit(m - 15, 15, 3, 5);
    return [warm(10), ...sets(n, (i) => work(`Umbral ${i + 1}`, 10, ftp(0.93, 1.02), 'Firme y parejo.'), () => rest('Pausa', 5)), cool(5)];
  }),
  def('sweet-spot', 'Sweet spot 3×12', 'threshold', 'bike', 1, [55, 110], ['fisica'], '3:1', 'Un poco por debajo del umbral: mucho estímulo y menos fatiga.', (m) => {
    const n = fit(m - 15, 16, 3, 5);
    return [warm(10), ...sets(n, (i) => work(`Bloque ${i + 1}`, 12, ftp(0.88, 0.94), 'Duro, pero que puedas terminar.'), () => rest('Pausa', 4)), cool(5)];
  }),
  def('vo2-5x3', 'VO2 máx 5×3', 'vo2', 'bike', 1, [50, 90], ['fisica', 'psicologica'], '1:1', 'Intervalos de 3 minutos muy fuertes con 3 de pausa.', (m) => {
    const n = fit(m - 20, 6, 4, 8);
    return [warm(15, 'Calentá bien: viene intenso.'), ...sets(n, (i) => work(`Intervalo ${i + 1}`, 3, ftp(1.06, 1.2), 'Salí controlado, el último minuto es el que cuesta.'), () => rest('Pausa', 3)), cool(5)];
  }),
  def('vo2-30-30', 'VO2 máx 30/30', 'vo2', 'bike', 2, [50, 70], ['fisica'], '1:1', 'Series de 30 segundos fuertes y 30 suaves.', (m) => {
    const series = fit(m - 25, 11, 2, 3);
    const out: Block[] = [warm(15, 'Calentá bien: viene intenso.')];
    for (let s = 0; s < series; s++) {
      out.push(...sets(10, () => work('Fuerte', 0.5, ftp(1.1, 1.3)), () => rest('Suave', 0.5)));
      if (s < series - 1) out.push(rest('Pausa entre series', 5));
    }
    out.push(cool(5));
    return out;
  }),
  def('sprint-8x15', 'Sprints 8×15 s', 'sprint', 'bike', 1, [45, 70], ['fisica', 'tecnica'], '1:12', 'Arranques cortos a fondo con mucha pausa.', (m) => {
    const n = fit(m - 20, 3.5, 5, 10);
    return [warm(15), ...sets(n, (i) => work(`Sprint ${i + 1}`, 0.25, rpe(9, 10), 'A fondo, parado o sentado, con la bici estable.'), () => rest('Pausa', 3.25)), cool(5)];
  }),
  def('fuerza-subida', 'Fuerza en subida', 'climb', 'bike', 1, [60, 80], ['fisica', 'tecnica'], '2:1', 'Subidas con desarrollo largo y cadencia baja.', (m) => {
    const n = fit(m - 15, 7, 4, 8);
    return [warm(10), ...sets(n, (i) => work(`Subida ${i + 1}`, 4, z(3), 'Cadencia entre 55 y 65, espalda firme.'), () => rest('Bajada suave', 3)), cool(5)];
  }),
  def('subidas-repetidas', 'Subidas repetidas', 'climb', 'bike', 1, [55, 75], ['fisica', 'tecnica', 'tactica'], '1:1', 'Subidas de 3 minutos en zona 4, administrando el esfuerzo.', (m) => {
    const n = fit(m - 15, 6, 4, 8);
    return [warm(10), ...sets(n, (i) => work(`Subida ${i + 1}`, 3, z(4), 'No arranques de más: guardá para el final de la subida.'), () => rest('Bajada suave', 3)), cool(5)];
  }),
  def('test-20', 'Test de 20 minutos', 'test', 'bike', 0, [45, 55], ['fisica', 'tactica', 'psicologica'], null, 'Veinte minutos al mayor ritmo parejo que aguantes. De acá sale tu FTP estimado.', () => [
    warm(15, 'Hoy medimos tu nivel.'),
    work('Cadencia alta', 1, z(3)),
    rest('Pausa', 2),
    work('Test de 20 minutos', 20, rpe(8, 9), 'Ritmo parejo: ni muy fuerte al principio ni flojo al final.'),
    cool(10),
  ]),
  def('apertura', 'Apertura', 'opener', 'bike', 0, [25, 50], ['fisica', 'psicologica'], '1:3', 'Salida corta con unos minutos fuertes para llegar afilado.', (m) => [
    warm(10),
    ...sets(3, (i) => work(`Apertura ${i + 1}`, 1, z(4), 'Fuerte pero corto, sin vaciarte.'), () => rest('Pausa', 3)),
    cool(Math.max(5, m - 22)),
  ]),
  def(
    'fuerza-piernas',
    'Fuerza de piernas',
    'strength',
    'off',
    0,
    [25, 45],
    ['fisica'],
    '2:1',
    'Circuito en casa, sin equipamiento: sentadilla, zancadas, puente, peso muerto a una pierna y gemelos.',
    (m) => {
      const rounds = Math.max(2, Math.min(4, Math.floor((m - 5) / 5)));
      return [
        { label: 'Movilidad de entrada', role: 'warmup', durationSec: sec(3), intensity: rpe(2, 3), cue: 'Círculos de cadera y rodillas.' },
        ...circuit(['Sentadillas', 'Zancadas alternadas', 'Puente de glúteos', 'Peso muerto a una pierna', 'Elevación de talones'], 40, 20, rounds, rpe(6, 7), 'Movimiento lento al bajar y firme al subir.'),
        { label: 'Estiramiento', role: 'cooldown', durationSec: sec(2), intensity: rpe(1, 2) },
      ];
    },
  ),
  def('core-estabilidad', 'Core y estabilidad', 'core', 'off', 0, [15, 30], ['fisica', 'tecnica'], '2:1', 'Plancha y variantes para sostener la postura en la bici y al correr.', (m) => {
    const rounds = Math.max(2, Math.min(4, Math.floor((m - 3) / 4)));
    return [
      { label: 'Activación', role: 'warmup', durationSec: sec(2), intensity: rpe(2, 3) },
      ...circuit(['Plancha', 'Plancha lateral izquierda', 'Plancha lateral derecha', 'Bicho muerto'], 30, 15, rounds, rpe(5, 6), 'Abdomen firme y respiración continua.'),
    ];
  }),
  def('movilidad', 'Movilidad', 'mobility', 'off', 0, [10, 30], ['fisica', 'psicologica'], null, 'Cadera, isquiotibiales y espalda: ejercicios suaves para recuperarte.', (m) => {
    const rounds = Math.max(1, Math.min(3, Math.floor(m / 7)));
    return circuit(['Flexores de cadera', 'Isquiotibiales', 'Gato y camello', 'Rotación de columna', 'Pantorrillas'], 45, 10, rounds, rpe(2, 3), 'Respirá hondo y no rebotes.');
  }),
];

// --- Correr (pedido 15) ---------------------------------------------------------------------
// Las intensidades `ftp` son fracciones de la velocidad de umbral (la que sostenés una hora).

/** Nombre del bloque del test de 30 minutos: su promedio sale de los registros para el umbral. */
export const TEST_RUN_LABEL = 'Test de 30 minutos';

const cad: Intensity = { type: 'cadence' };
const rwarm = (min: number, cue = 'Arrancá trotando muy suave.'): Block => ({ label: 'Calentamiento', role: 'warmup', durationSec: sec(min), intensity: z(1), cue });
const rcool = (min: number): Block => ({ label: 'Vuelta a la calma', role: 'cooldown', durationSec: sec(min), intensity: z(1), cue: 'Aflojá: trote suave o caminata.' });
const jog = (label: string, min: number): Block => rest(label, min, z(1));

function rsteady(label: string, totalMin: number, intensity: Intensity, cue?: string): Block[] {
  return [rwarm(10), work(label, Math.max(5, totalMin - 15), intensity, cue), rcool(5)];
}

/** Sesión de correr. `maxLevel` deja afuera a quien ya no la necesita (correr y caminar). */
const rdef = (
  id: string,
  name: string,
  kind: WorkoutKind,
  minLevel: Level,
  range: [number, number],
  preparations: WorkoutDef['preparations'],
  density: string | null,
  description: string,
  build: (totalMin: number) => Block[],
  maxLevel?: Level,
): WorkoutDef => ({ ...def(id, name, kind, 'run', minLevel, range, preparations, density, description, build), ...(maxLevel !== undefined ? { maxLevel } : {}) });

export const RUN_WORKOUTS: WorkoutDef[] = [
  rdef('trote-regenerativo', 'Trote regenerativo', 'recovery', 0, [20, 50], ['fisica'], null, 'Trote muy suave para recuperarte. Si hace falta, caminá un rato.', (m) => [
    rwarm(5),
    work('Trote suave', Math.max(5, m - 10), z(1), 'Pasos cortos y livianos, sin apuro.'),
    rcool(5),
  ]),
  rdef(
    'correr-caminar',
    'Correr y caminar',
    'endurance',
    0,
    [20, 60],
    ['fisica', 'psicologica'],
    '2:1',
    'Para empezar: dos minutos corriendo suave y uno caminando. El cuerpo se acostumbra de a poco al impacto.',
    (m) => {
      const n = fit(m - 10, 3, 4, 15);
      return [
        { label: 'Caminata', role: 'warmup', durationSec: sec(5), intensity: rpe(2, 3), cue: 'Caminá a paso firme.' },
        ...sets(n, (i) => work(`Corré ${i + 1}`, 2, z(2), i === 0 ? 'Tan suave que puedas charlar.' : undefined), () => rest('Caminá', 1, rpe(2, 3))),
        { label: 'Caminata final', role: 'cooldown', durationSec: sec(5), intensity: rpe(1, 2) },
      ];
    },
    0,
  ),
  rdef('rodaje-z2', 'Rodaje en zona 2', 'endurance', 0, [30, 90], ['fisica', 'psicologica'], null, 'Base aeróbica: ritmo cómodo en el que podés conversar.', (m) =>
    rsteady('Rodaje zona 2', m, z(2), 'Ritmo de charla: si no podés hablar, aflojá.'),
  ),
  rdef('rodaje-progresiones', 'Rodaje con progresiones', 'endurance', 0, [35, 80], ['fisica', 'tecnica'], '1:3', 'Rodaje suave y al final unas aceleraciones cortas cuidando la cadencia.', (m) => {
    const strides = 5;
    const easy = Math.max(10, m - 15 - strides * 1.33);
    return [
      rwarm(10),
      work('Rodaje zona 2', easy, z(2), 'Suave y parejo.'),
      ...sets(strides, (i) => work(`Progresión ${i + 1}`, 1 / 3, cad, i === 0 ? 'Acelerá de a poco con pasos cortos y rápidos.' : undefined), () => jog('Trote', 1)),
      rcool(5),
    ];
  }),
  rdef('fondo-largo-correr', 'Fondo largo', 'long', 0, [50, 150], ['fisica', 'tactica', 'psicologica'], null, 'La carrera larga de la semana, en zona 2. Practicá tomar agua.', (m) =>
    rsteady('Fondo zona 2', m, z(2), 'Tomá agua cada 20 minutos si pasás la hora.'),
  ),
  rdef('largo-progresivo-correr', 'Fondo progresivo', 'long', 1, [60, 150], ['fisica', 'tactica'], null, 'Empieza en zona 2 y termina en zona 3: terminar más fuerte de lo que arrancaste.', (m) => {
    const useful = m - 15;
    const a = Math.round(useful * 0.75);
    return [rwarm(10), work('Zona 2', a, z(2), 'Guardá fuerzas para el final.'), work('Zona 3 final', useful - a, z(3), 'Ahora sí, subí un cambio.'), rcool(5)];
  }),
  rdef('tempo-continuo-correr', 'Tempo continuo', 'tempo', 0, [35, 75], ['fisica'], null, 'Un bloque sostenido en zona 3: firme pero controlado.', (m) =>
    rsteady('Tempo zona 3', m, z(3), 'Respiración marcada pero estable.'),
  ),
  rdef('tempo-2x15-correr', 'Tempo 2×15', 'tempo', 1, [50, 80], ['fisica'], '5:1', 'Dos o tres bloques de tempo con trote corto entre medio.', (m) => {
    const n = fit(m - 15, 18, 2, 3);
    return [rwarm(10), ...sets(n, () => work('Tempo', 15, z(3), 'Parejo, sin acelerar en las bajadas.'), () => jog('Trote', 3)), rcool(5)];
  }),
  rdef('ritmo-constante-correr', 'Ritmo constante en bloques de 6', 'steady', 0, [40, 80], ['fisica', 'tecnica'], '3:1', 'Mantener el ritmo dentro de la banda: la técnica de correr parejo.', (m) => {
    const n = fit(m - 15, 8, 3, 6);
    return [rwarm(10), ...sets(n, (i) => work(`Bloque ${i + 1}`, 6, ftp(0.82, 0.88), 'Elegí un ritmo y no lo sueltes.'), () => jog('Trote', 2)), rcool(5)];
  }),
  rdef('umbral-3x10-correr', 'Umbral 3×10', 'threshold', 1, [50, 80], ['fisica', 'psicologica'], '5:1', 'Tres bloques de 10 minutos en el umbral.', (m) => {
    const n = fit(m - 15, 12, 3, 4);
    return [rwarm(10, 'Hoy toca duro: entrá en calor bien.'), ...sets(n, (i) => work(`Umbral ${i + 1}`, 10, ftp(0.97, 1.02), 'Pensá en el próximo minuto, no en el bloque entero.'), () => jog('Trote', 2)), rcool(5)];
  }),
  rdef('umbral-cruceros', 'Umbral en bloques de 6', 'threshold', 1, [45, 80], ['fisica'], '4:1', 'Bloques cortos en el umbral con pausas breves: mucho trabajo de calidad.', (m) => {
    const n = fit(m - 15, 7.5, 4, 6);
    return [rwarm(10), ...sets(n, (i) => work(`Bloque ${i + 1}`, 6, ftp(0.98, 1.03), 'Firme y parejo.'), () => jog('Trote', 1.5)), rcool(5)];
  }),
  rdef('vo2-5x3-correr', 'VO2 máx 5×3', 'vo2', 1, [45, 70], ['fisica', 'psicologica'], '1:1', 'Intervalos de 3 minutos muy fuertes con 3 de trote.', (m) => {
    const n = fit(m - 20, 6, 4, 6);
    return [rwarm(15, 'Calentá bien: viene intenso.'), ...sets(n, (i) => work(`Intervalo ${i + 1}`, 3, ftp(1.05, 1.12), 'Salí controlado, el último minuto es el que cuesta.'), () => jog('Trote', 3)), rcool(5)];
  }),
  rdef('vo2-30-30-correr', 'VO2 máx 30/30', 'vo2', 2, [40, 60], ['fisica'], '1:1', 'Series de 30 segundos fuertes y 30 de trote.', (m) => {
    const series = fit(m - 25, 11, 2, 3);
    const out: Block[] = [rwarm(15, 'Calentá bien: viene intenso.')];
    for (let s = 0; s < series; s++) {
      out.push(...sets(10, () => work('Fuerte', 0.5, ftp(1.1, 1.2)), () => jog('Trote', 0.5)));
      if (s < series - 1) out.push(jog('Pausa entre series', 4));
    }
    out.push(rcool(5));
    return out;
  }),
  rdef('cuestas', 'Cuestas', 'climb', 1, [45, 70], ['fisica', 'tecnica'], '1:2', 'Subidas cortas y fuertes con bajada trotando: fuerza para correr.', (m) => {
    const n = fit(m - 15, 3, 6, 10);
    return [rwarm(10), ...sets(n, (i) => work(`Cuesta ${i + 1}`, 1, z(4), 'Pasos cortos, brazos activos y la mirada al frente.'), () => jog('Bajada trotando', 2)), rcool(5)];
  }),
  rdef('tecnica-correr', 'Técnica y aceleraciones', 'sprint', 0, [35, 60], ['tecnica', 'fisica'], '1:3', 'Ejercicios de técnica (skipping y talones) y aceleraciones cortas cuidando los pasos por minuto.', (m) => {
    const easy = Math.max(5, m - 10 - 8 - 6 * 1.67 - 5);
    return [
      rwarm(10),
      ...sets(4, (i) => work(i % 2 === 0 ? 'Skipping' : 'Talones a la cola', 0.5, rpe(5, 6), i === 0 ? 'Rodillas arriba, apoyos cortos.' : undefined), () => rest('Caminá', 1.5, rpe(2, 3))),
      ...sets(6, (i) => work(`Aceleración ${i + 1}`, 1 / 3, cad, i === 0 ? 'Rápido pero suelto, pasos cortos y livianos.' : undefined), () => jog('Trote', 4 / 3)),
      work('Rodaje suave', easy, z(2)),
      rcool(5),
    ];
  }),
  rdef('test-30-correr', 'Test de 30 minutos', 'test', 0, [45, 60], ['fisica', 'tactica', 'psicologica'], null, 'Treinta minutos al mayor ritmo parejo que aguantes. De acá sale tu ritmo de umbral.', () => [
    rwarm(12, 'Hoy medimos tu nivel.'),
    ...sets(3, () => work('Aceleración', 1 / 3, z(4)), () => jog('Trote', 1)),
    jog('Pausa', 1),
    work(TEST_RUN_LABEL, 30, rpe(8, 9), 'Ritmo parejo: ni muy fuerte al principio ni flojo al final.'),
    rcool(8),
  ]),
  rdef('apertura-correr', 'Apertura', 'opener', 0, [25, 45], ['fisica', 'psicologica'], '1:2', 'Trote corto con unos minutos fuertes para llegar afilado.', (m) => [
    rwarm(10),
    ...sets(4, (i) => work(`Apertura ${i + 1}`, 1, z(4), 'Fuerte pero corto, sin vaciarte.'), () => jog('Trote', 2)),
    rcool(Math.max(5, m - 21)),
  ]),
];

/** Todas las sesiones: bici, correr y fuera. */
export const ALL_WORKOUTS: WorkoutDef[] = [...WORKOUTS, ...RUN_WORKOUTS];

export function workoutById(id: string): WorkoutDef | undefined {
  return ALL_WORKOUTS.find((w) => w.id === id);
}

/** Las que hay para un tipo de sesión, del deporte, aptas para el nivel y que entran en la duración (con margen). */
export function candidates(kinds: WorkoutKind[], level: Level, durationMin: number, sport: TrainSport = 'bike'): WorkoutDef[] {
  const list = sport === 'run' ? RUN_WORKOUTS : WORKOUTS.filter((w) => w.where === 'bike');
  return list.filter((w) => kinds.includes(w.kind) && w.minLevel <= level && (w.maxLevel ?? 2) >= level && durationMin >= w.minMin - 5);
}

/** La sesión de test de cada deporte. */
export const testWorkoutId = (sport: TrainSport) => (sport === 'run' ? 'test-30-correr' : 'test-20');

/** Duración total de una lista de bloques, en minutos. */
export function blocksMinutes(blocks: Block[]): number {
  return blocks.reduce((s, b) => s + b.durationSec, 0) / 60;
}
