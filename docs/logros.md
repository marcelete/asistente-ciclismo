# Logros, victorias y festejos

Referencia de cómo funcionan los premios de la app (0.5.0). Sale directo del código: `mobile/src/core/awards/` (`catalog.ts`, `engine.ts`, `celebrate.ts`). Si cambia el código, hay que actualizar este archivo.

**Solo cuentan las salidas en bici.** Una caminata o una corrida se ve en la lista con el chip "No cuenta" y no suma a ningún premio.

## Qué es cada cosa

| Cosa | Qué es | Se gana |
|---|---|---|
| **Trofeo** (insignia) | Un umbral de una familia: "100 km en total", "Salida número 50" | Una sola vez, para siempre |
| **Victoria** | Superar un récord propio o una mejor marca | Cada vez que se supera |
| **Meta cumplida** | Una meta tuya (semanal, mensual o anual) llegó al objetivo | Una por cada período en que la cumplís |
| **Programa terminado** | Terminar uno de los programas para seguir | Una vez por programa (siempre oro) |

Los trofeos no se pierden ni se reinician: se recalculan cada vez que cambian las salidas (al importar, borrar o recalcular), siempre con el mismo resultado. Si una salida deja de contar (por ejemplo la marcás como "No cuenta"), los premios que dependían de ella se retiran.

## ¿Se actualizan mes a mes?

**No hay reinicio mensual.** Los trofeos son de por vida. Lo que sí mira el calendario:

- **Kilómetros en un mes** (200, 500, 1.000 km): suma lo de un mes calendario. Se gana una vez, la primera vez que un mes llega al umbral. El progreso que se muestra en "Próximos premios" es el del mes en curso y arranca de cero cada mes.
- **Tu mes con más kilómetros** y **Tu semana con más kilómetros**: victorias, una por período, cuando ese mes o semana supera a todos los anteriores.
- **Victorias por mes**: en la pestaña Logros, las victorias se agrupan por mes para leerlas.
- **Metas**: se evalúan por período (semana, mes o año) y cada período cumplido cuenta una vez. La meta solo cuenta salidas posteriores a su creación.

## ¿Hay logros de "hacer algo N veces en un tiempo"?

Parcialmente. Hay dos tipos con tiempo de por medio:

- **Rachas** (días o semanas seguidos sin cortar): 3, 7, 14 y 30 días; 4, 8, 12, 26 y 52 semanas.
- **Acumulado dentro de un mes**: los kilómetros en un mes.

**No hay** todavía premios del estilo "5 salidas en una semana", "4 salidas de 50 km en un mes" o "pedalear 3 meses seguidos con más de 200 km". "Mismo recorrido" cuenta las repeticiones sin límite de tiempo.

## ¿Hay logros anuales o interanuales?

**No.** Los totales (kilómetros, desnivel, cantidad de salidas) son de toda la historia, y la racha de 52 semanas es "un año sin cortar", no un año calendario. Las **metas anuales** sí existen (Metas → Anual) y cuentan para "Metas cumplidas". Ideas posibles, sin hacer (decidir si se agregan): kilómetros en un año, salidas en un año, meses seguidos con un mínimo de kilómetros, y superar el año anterior a la misma fecha.

## Trofeos: todas las familias

El nivel (bronce, plata, oro, platino) sale de la posición del umbral dentro de su familia: el primer cuarto de la lista es bronce, el segundo plata, el tercero oro y el último platino.

| Familia | Umbrales | Notas |
|---|---|---|
| Kilómetros totales | 100, 250, 500, 1.000, 2.500, 5.000, 10.000, 20.000, 40.075 km | El último es la vuelta al mundo |
| Desnivel total | 1.000, 2.790, 4.806, 6.961, 8.849, 17.698, 50.000, 100.000 m | Con nombre de montaña (Champaquí, Mont Blanc, Aconcagua, Everest…). Espera la altitud del mapa de terreno |
| Cantidad de salidas | 1, 10, 25, 50, 100, 250, 500, 900, 1.000 | |
| Salida larga | 20, 50, 100, 160, 200 km | En una sola salida |
| Salida con subida | 500, 1.000, 2.000 m | En una sola salida; espera la altitud |
| Salida de muchas horas | 2, 3, 4, 6 h | En una sola salida |
| Racha de días | 3, 7, 14, 30 | Días seguidos con salida |
| Racha de semanas | 4, 8, 12, 26, 52 | Semanas seguidas con salida |
| Metas cumplidas | 1, 5, 10, 25 | |
| Horarios | Madrugador (salir antes de las 7), Nocturno (después de las 21) | Dos premios sueltos, no una escala |
| Velocidad media | 20, 25, 30 km/h | Solo salidas de 20 km o más |
| Kilómetros en un mes | 200, 500, 1.000 km | Ver arriba |
| Récords superados | 1, 10, 50 | Cuenta las victorias de tipo récord (1.ª posición) |
| Mismo recorrido | 5, 10, 25 veces | Necesita recorridos detectados (fase 7) |
| Frío | 5 °C o menos, 0 °C o menos | Necesita el clima de la salida (ciudad cargada) |
| Calor | 32 °C, 38 °C | Idem |
| Viento | 30, 45 km/h | Idem |
| Kilómetros con una bici | 1.000, 5.000, 10.000 km | Por cada bici de Mis bicis |
| Programas | Uno por programa terminado | Siempre oro |

## Victorias (récords)

Cada salida se compara con las anteriores:

- **Récord de distancia**, **de desnivel**, **de tiempo en movimiento** y **de velocidad media** (esta solo para salidas de 10 km o más).
- **Mejores tiempos en 1, 5, 10, 20, 40, 50 y 100 km**: la mejor marca da una victoria "Mejor tiempo", y la **2.ª y la 3.ª mejor marca** también dan victoria (menor jerarquía).
- **Récord en un segmento personal**: la mejor pasada de la salida contra tus pasadas anteriores.
- **Semana o mes con más kilómetros** (ver arriba).

Dos reglas para que no haya premios de regalo: **la primera marca de cada métrica no es una victoria** (es la base contra la que se compara; por eso con una sola salida no hay récords) y la 2.ª y la 3.ª mejor marca solo cuentan si desplazan a una marca anterior. "Récords superados" cuenta las victorias de tipo récord (la 1.ª posición), no las de 2.ª y 3.ª.

## Festejos

El confeti, el trofeo y el sonido salen según estas reglas (`celebrate.ts`):

1. **Primera vez** que se calculan los premios: todo lo ganado se marca como visto. Si son 3 o menos se festejan uno por uno; si son más, aparece un solo resumen. Así no hay una lluvia de festejos al importar el historial.
2. Después se festeja solo lo **no visto** de las salidas importadas en esa apertura de la app y de los últimos **14 días**.
3. Recálculos, restauraciones de respaldo, segmentos nuevos y clima o altitud de salidas viejas se marcan como vistos **sin festejo**.
4. Lo que depende del desnivel espera a que llegue la altitud del mapa de terreno.
5. **Una tarjeta por salida, máximo 3**, y "y N más" que lleva a Logros.

Prioridad dentro de una tarjeta: récord, meta, trofeo, período, 2.ª y 3.ª marca. El sonido sale de la prioridad más alta: fanfarria para un récord, acorde para una meta y destello para lo demás. Se apagan en Ajustes → Sonido y vibración (festejos, sonidos y vibración por separado; el modo silencio del teléfono siempre se respeta).

## En la pantalla

La pestaña **Logros** muestra: los 5 próximos premios más cerca (con barra de progreso), la vitrina por familia (los bloqueados en gris), las victorias agrupadas por mes y los mejores tiempos.
