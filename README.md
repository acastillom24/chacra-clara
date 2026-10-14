# Chacra Clara

Herramienta web para el productor de arroz. Responde tres preguntas:

1. **¿Desde qué precio gano?** (precio de equilibrio con tus costos reales)
2. **¿Qué precio suele haber cuando cosecho?** (estacionalidad con tu historial, con rangos, no con un número único)
3. **¿Cuándo conviene sembrar?** (mes de siembra → mes de cosecha → resultado típico, más agua y lluvia de tu zona)

Funciona en celular y computadora, se puede instalar como app (PWA) y sigue funcionando sin internet una vez abierta.
Los datos se guardan **solo en el navegador del usuario** (localStorage); no hay servidor ni base de datos.

## Publicar en Vercel

No tiene paso de compilación: es HTML, CSS y JS puros.

**Opción A: arrastrar (la más simple)**
1. Entra a vercel.com e inicia sesión.
2. `Add New… → Project`, y sube esta carpeta (o instala la CLI y ejecuta `npx vercel` dentro de la carpeta).
3. Framework Preset: **Other**. Build Command y Output Directory: vacíos. Deploy.

**Opción B: con GitHub**
1. Sube la carpeta a un repositorio.
2. En Vercel: `Add New… → Project → Import` el repositorio, con los mismos ajustes (Other, sin build).

Cada `git push` vuelve a publicar. Si cambias archivos, sube la versión en `sw.js` (`CACHE = 'chacra-clara-v2'`) para que los celulares reciban la actualización.

## Cómo usarla con los datos reales

1. **Costos:** pon los costos por hectárea de la última campaña, el rendimiento prudente (promedio de campañas) y la meta de ganancia.
2. **Precios:** registra el **precio en chacra** que pagan los molinos de la zona (llamadas, vecinos, boletas de venta). Los boletines de MIDAGRI sirven de referencia mayorista, pero no son lo que cobra el productor. Para cargar años pasados, pega líneas o sube un CSV (`data/plantilla-precios.csv`).
3. **Siembra:** con 3 años o más de precios mensuales, la estacionalidad empieza a ser útil. Completa agua y lluvia por mes con la experiencia local y SENAMHI.
4. **Escenarios:** prueba un caso malo (rendimiento bajo y precio bajo) antes de decidir.

La primera vez que se abre muestra **datos de ejemplo inventados**; el botón "Empezar con mis datos" los borra.

## Estructura

| Archivo | Para qué |
|---|---|
| `index.html`, `styles.css`, `app.js` | Interfaz (6 secciones) |
| `calc.js` | Cálculos (equilibrio, estacionalidad, plan de siembra, CSV). Sin DOM, se puede probar con Node |
| `sw.js`, `manifest.webmanifest`, `icon*` | Instalable y sin conexión |
| `vercel.json` | Cabeceras y URLs limpias |

## Limitaciones y riesgos

- No predice precios. Resume lo que pasó en años anteriores y muestra rangos.
- La calidad depende de los datos: pocos años o precios mal anotados dan conclusiones débiles.
- Los precios históricos no están ajustados por inflación.
- No modela plagas, inundaciones, sequías, humedad del grano ni cambios de política (aranceles, importaciones).
- Como cada usuario guarda sus datos en su dispositivo, no hay comparación entre agricultores ni respaldo automático (existe descarga manual de copia).

## Siguientes pasos (si funciona con tu papá)

- **Datos compartidos:** un backend sencillo (Vercel + una base de datos) para que varios agricultores aporten precios en chacra anónimos por zona. Es lo que más valor daría a otros productores.
- **Alertas por WhatsApp** cuando el precio supere el equilibrio o la meta (requiere servicio de mensajería y un servidor que revise precios).
- **Lectura automática de los boletines PDF de MIDAGRI** para alimentar el precio mayorista. Los formatos cambian, así que habría que vigilarlo.
- **Pronóstico estadístico** solo después de comprobar con datos pasados que acierta mejor que "el mismo mes de otros años".

## Probar en local

```
npx serve .
```
(el service worker solo se activa en `localhost` o `https`)

## Base de datos (Neon) y cuentas

Desde la versión 2 los datos viven en Neon (Postgres) y cada usuario tiene su cuenta, su finca y sus parcelas. Esta sección reemplaza lo dicho arriba sobre guardar solo en el navegador.

1. Crea un proyecto en [neon.com](https://neon.com) y copia la cadena de conexión (pooler).
2. En Vercel: Settings → Environment Variables → `DATABASE_URL`. En local: `.env.local` (ver `.env.example`).
3. `npm install`, luego `npm run db:migrate` y `npm run db:seed` (con `DATABASE_URL` definida).
4. Local: `vercel dev`. Cuentas demo simuladas (Utcubamba/Bagua, Amazonas): `demo1@chacraclara.pe`, `demo2@…`, `demo3@…`, contraseña `ChacraDemo2026`. Bórralas en producción real.

Estructura: `api/` (funciones serverless), `db/migrations/` (esquema), `db/seed.js` (datos simulados), `api.js` (cliente). Las parcelas de una finca no pueden sumar más hectáreas que la finca. Los precios `SIMULADO` son de referencia compartida por región.
