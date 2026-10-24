/** Errores del cliente de Open-Meteo para los tests: se definen acá porque `jest.mock` no deja usar clases que extienden `Error` dentro de su fábrica. */
export class OpenMeteoWait extends Error {
  until: number;
  constructor(until: number) {
    super('espera');
    this.until = until;
  }
}
export class OpenMeteoCancelled extends Error {}
