# Asistente Ciclismo

App **gratuita y privada** para Android que analiza tus salidas en bici **en tu propio celular**. No tiene cuentas, ni servidores, ni anuncios, ni estadísticas de uso: tus datos viven solo en tu teléfono.

La grabación la hace [OpenTracks](https://opentracksapp.com/) (GPS y sensor de frecuencia cardíaca); esta app importa los GPX que exporta y los analiza.

> **Estado: en desarrollo (versión 0.5.0).** Todavía no hay un APK publicado para instalar: hay que compilarla desde el código (más abajo). Se probó en un Galaxy A71 (Android 13) y en el emulador, pero con pocas salidas reales: puede haber errores. Los APK se van a publicar en *Releases* cuando estén firmados con una clave propia.

### ¿Por qué usarla si existe OpenTracks?

No compite con OpenTracks: lo complementa. OpenTracks graba muy bien y muestra las estadísticas de cada grabación. Esta app mira **todas tus salidas juntas**: historial, totales por período, rachas, metas con recordatorios, récords, logros, carga de entrenamiento, clima y exportación de los datos. Si solo querés grabar y ver cada salida, OpenTracks alcanza.

## Qué hace

- **Tus salidas:** distancia, tiempo, velocidad, desnivel (con altitud del terreno), frecuencia cardíaca, zonas, carga de entrenamiento y estado de forma.
- **Totales y metas:** por día, semana, mes y año, rachas, metas con recordatorios y récords personales.
- **Logros:** premios, victorias al superar un récord, segunda y tercera mejor marca (ver [cómo funcionan](docs/logros.md)).
- **Mapas:** el recorrido de cada salida, mapa de calor, segmentos propios y recorridos que repetís.
- **Bicis:** varias bicis con cubiertas, kilómetros por bici y aviso de mantenimiento de componentes.
- **Potencia estimada** con un modelo físico (peso, cubiertas, pendiente, aire y viento). No reemplaza a un medidor de potencia.
- **Clima** de cada salida, **predicciones**, plan semanal y programas para seguir.
- **Exportar tus datos:** un ZIP con CSV y un respaldo completo, para analizarlos con la herramienta o la IA que prefieras.

Todo lo calcula el celular. La app está en español rioplatense.

## Privacidad

- Las salidas, el perfil de salud y las bicis se guardan **solo en el celular**. No hay backup en la nube y *Ajustes → Borrar todos mis datos* borra todo.
- Lo único que sale del celular tiene un interruptor en *Ajustes → Privacidad*:
  - la **altitud del terreno** y el **clima**, que se piden a [Open-Meteo](https://open-meteo.com/) con coordenadas redondeadas (nunca el inicio ni el final de tus salidas; el clima usa el centro de tu ciudad);
  - los **mosaicos del mapa** de OpenStreetMap, que ven tu IP y la zona que mirás.
- El registro de errores no guarda ubicaciones ni nombres de archivo.
- Sin analíticas, sin publicidad, sin rastreo.

## Requisitos

- Un celular **Android**. Pensada para cualquier marca (Samsung, Motorola, Xiaomi…); por ahora está probada solo en un Samsung.
- [OpenTracks](https://f-droid.org/packages/de.dennisguse.opentracks/) para grabar.
- **iPhone no es compatible:** iOS no instala APK y OpenTracks es solo para Android.

## Cómo se usa

1. En OpenTracks: *Ajustes → Import and Export* → elegí una carpeta de exportación, activá *Instant post-workout export* y poné el formato en **GPX**.
2. En la app: *Salidas → Elegir carpeta* y elegí esa misma carpeta. Desde ahí, cada salida nueva se importa sola al abrir la app.
3. En Xiaomi y otras marcas con ahorro de batería agresivo, poné la batería de OpenTracks y de la app en *Sin restricciones*.
4. **Desactivá el ahorro de energía de Android antes de salir.** Con el ahorro encendido, Android apaga el GPS cuando se bloquea la pantalla y OpenTracks deja de grabar (se comprobó en un Samsung). La app te avisa si lo tenés encendido. Si querés dejar la pantalla prendida mientras grabás, activá en OpenTracks *Configuración → Interfaz de usuario → Mantener la pantalla encendida*.

## Lo que no hace (todavía)

- **No graba:** la grabación es de OpenTracks.
- Solo lee GPX: no importa FIT ni TCX, ni la exportación de Strava.
- No tiene mapas sin conexión ni importa rutas para seguir.
- Solo cuentan las salidas en bici: las caminatas y otras actividades se ven en la lista, pero no suman a nada.
- iPhone no es compatible.

## Cómo opinar o avisar de un problema

Abrí un *Issue* en este repositorio. Si es un error, pegá el texto de *Ajustes → Registro* (está redactado y no incluye ubicaciones) y contá qué celular tenés. Sin datos personales, por favor: no pegues tus GPX.

## Compilar desde el código

Requiere Node.js y el SDK de Android. Desde la carpeta `mobile/`:

```
npm install
npm test            # pruebas
npm run typecheck   # chequeo de tipos
npx eslint .        # linter
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

El proyecto usa [Expo](https://expo.dev/) (React Native y TypeScript). La carpeta `android/` se genera y no se edita a mano. Los sonidos se generan con `npm run sounds`.

## Licencia

[GPL-3.0](LICENSE). Podés usarla, estudiarla, modificarla y compartirla; si distribuís una versión modificada, tiene que seguir siendo libre con su código abierto.

## Datos de terceros

Mapas © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright). Altitud y clima de [Open-Meteo](https://open-meteo.com/) (datos Copernicus y reanálisis, uso no comercial).
