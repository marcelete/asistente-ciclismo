import type { TrainSport } from '../stats/sport';
import type { MesoKind } from './types';

/** Fichas de la preparación teórica: una por semana, atada al bloque en curso. */
export interface Lesson {
  id: string;
  title: string;
  text: string;
}

export const LESSONS: Record<string, Lesson> = {
  zonas: {
    id: 'zonas',
    title: 'Para qué sirven las zonas',
    text: 'Cada zona de frecuencia cardíaca entrena algo distinto. La zona 2 construye la base aeróbica; la 3 y la 4 suben el ritmo que sostenés; la 5 sube el techo. Si siempre entrenás en el medio, no desarrollás ninguno bien.',
  },
  supercompensacion: {
    id: 'supercompensacion',
    title: 'Supercompensación',
    text: 'Entrenar te cansa y te baja el rendimiento. Con descanso, el cuerpo se recompone un poco por encima del nivel anterior. Si entrenás de nuevo en ese momento, subís; si te salteás el descanso, acumulás fatiga.',
  },
  descarga: {
    id: 'descarga',
    title: 'Por qué hay semanas de descarga',
    text: 'La mejora aparece cuando descansás, no mientras cargás. Cada tres o cuatro semanas se baja el volumen para que la forma suba y llegues a la próxima carga fresco.',
  },
  progresion: {
    id: 'progresion',
    title: 'Subir de a poco',
    text: 'El cuerpo se adapta a lo que se le pide, pero tarda. Subir el volumen más de un 10 % por semana es la causa más común de lesiones y de agotamiento.',
  },
  ritmo: {
    id: 'ritmo',
    title: 'Pedalear parejo',
    text: 'Salir fuerte y apagarse al final cuesta más que ir parejo. En un esfuerzo largo, los primeros minutos tienen que sentirse algo fáciles.',
  },
  nutricion: {
    id: 'nutricion',
    title: 'Comer y tomar en la bici',
    text: 'Pasada la hora y media, conviene tomar agua cada 15 minutos y comer 30 a 60 g de carbohidratos por hora. Hay que empezar antes de tener hambre o sed.',
  },
  cadencia: {
    id: 'cadencia',
    title: 'Cadencia',
    text: 'Pedalear entre 85 y 95 vueltas por minuto cuida las rodillas y deja los músculos más frescos. Para fuerza se practica cadencia baja en subida, pero en pocas series.',
  },
  umbral: {
    id: 'umbral',
    title: 'El umbral',
    text: 'Es el ritmo más fuerte que podés sostener alrededor de una hora. Entrenar justo por debajo y justo por encima de ese ritmo es lo que más lo sube.',
  },
  mental: {
    id: 'mental',
    title: 'Cabeza en los bloques duros',
    text: 'En un intervalo largo, dividí en tramos de un minuto y concentrate solo en el próximo. Anotar cómo te sentiste después también entrena la cabeza.',
  },
  afinar: {
    id: 'afinar',
    title: 'Llegar fresco',
    text: 'Antes de un evento se baja el volumen y se mantienen unos pocos arranques fuertes. Es normal sentirse raro y pesado: es la forma subiendo.',
  },
};

const BY_MESO: Record<MesoKind, string[]> = {
  introductorio: ['zonas', 'progresion', 'nutricion'],
  desarrollador: ['umbral', 'cadencia', 'supercompensacion', 'ritmo'],
  estabilizador: ['mental', 'umbral', 'descarga'],
  precompetitivo: ['ritmo', 'nutricion', 'mental'],
  competitivo: ['afinar', 'nutricion'],
  recuperacion: ['descarga', 'supercompensacion'],
};

/** Fichas de correr (pedido 15): reemplazan a las de bici con el mismo id, y suman las propias. */
export const RUN_LESSONS: Record<string, Lesson> = {
  ritmo: {
    id: 'ritmo',
    title: 'Correr parejo',
    text: 'Salir rápido y apagarse al final cuesta más que ir parejo. En una carrera larga, el primer kilómetro tiene que sentirse algo fácil; si podés, terminá un poco más rápido de lo que arrancaste.',
  },
  nutricion: {
    id: 'nutricion',
    title: 'Tomar y comer al correr',
    text: 'Hasta una hora alcanza con llegar hidratado. En carreras más largas, tomá unos sorbos cada 20 minutos y, pasada la hora y cuarto, sumá 30 a 60 g de carbohidratos por hora (geles o pasas). Probalo en los fondos, nunca por primera vez en la carrera.',
  },
  cadencia: {
    id: 'cadencia',
    title: 'Pasos por minuto',
    text: 'Con pasos más cortos y rápidos (entre 165 y 185 por minuto) el pie cae más cerca del cuerpo, frenás menos y las rodillas sufren menos. Subí la cadencia de a poco, un 5 % por vez.',
  },
  pisada: {
    id: 'pisada',
    title: 'La pisada',
    text: 'No hace falta forzar una forma de pisar. Lo importante es que el pie caiga debajo de la cadera y no por delante, con el cuerpo apenas inclinado hacia adelante y los hombros sueltos.',
  },
  conversable: {
    id: 'conversable',
    title: 'El ritmo de charla',
    text: 'La mayor parte de la semana se corre a un ritmo en el que podés hablar en frases completas. Parece lento, pero es el que construye la base aeróbica sin lesionarte.',
  },
  impacto: {
    id: 'impacto',
    title: 'Huesos y tendones van más lento',
    text: 'El corazón y los músculos se adaptan en semanas; los huesos y tendones, en meses. Por eso el volumen sube de a poco y, al empezar, entre carrera y carrera queda un día sin impacto. Un dolor que empeora al correr es señal de parar.',
  },
};

const BY_MESO_RUN: Record<MesoKind, string[]> = {
  introductorio: ['conversable', 'impacto', 'progresion', 'zonas'],
  desarrollador: ['umbral', 'cadencia', 'supercompensacion', 'pisada'],
  estabilizador: ['mental', 'umbral', 'descarga'],
  precompetitivo: ['ritmo', 'nutricion', 'mental'],
  competitivo: ['afinar', 'nutricion'],
  recuperacion: ['descarga', 'impacto'],
};

/** La ficha de la semana `weekInMeso` (desde 0) de un bloque. */
export function lessonFor(meso: MesoKind, weekInMeso: number, sport: TrainSport = 'bike'): Lesson {
  const ids = (sport === 'run' ? BY_MESO_RUN : BY_MESO)[meso];
  const id = ids[weekInMeso % ids.length];
  return (sport === 'run' ? RUN_LESSONS[id] : undefined) ?? LESSONS[id];
}
