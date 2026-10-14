# Chacra Clara

Herramienta web para el productor de arroz. Responde tres preguntas:

1. **¿Desde qué precio gano?** (precio de equilibrio con tus costos reales)
2. **¿Qué precio suele haber cuando cosecho?** (estacionalidad con tu historial, con rangos, no con un número único)
3. **¿Cuándo conviene sembrar?** (mes de siembra → mes de cosecha → resultado típico, más agua y lluvia de tu zona)

Funciona en celular y computadora y se puede instalar como app (PWA). Cada usuario tiene su **cuenta** (correo y contraseña) y sus datos se guardan en **Neon (Postgres)**, así que puede abrirlos desde cualquier equipo. Sin conexión puede seguir editando sus costos: se envían al volver la señal.

## Cómo funciona

- **Cuentas:** cada usuario tiene su finca, costos, parcelas y precios. Nadie ve los datos de otro.
- **Parcelas:** la finca se divide en parcelas con código único (P-01, P-02…), hectáreas, variedad, fecha de siembra y estado (activa, barbecho, cosechada). Las parcelas no pueden sumar más hectáreas que la finca.
- **Precios:** los que registra el usuario son privados. Los marcados `SIMULADO` son de referencia compartida para la región (Amazonas) y no se pueden borrar.
- **Frontend:** HTML, CSS y JS puros, sin paso de compilación.
- **Backend:** funciones serverless en `api/` (Vercel) que hablan con Neon. El navegador nunca ve la cadena de conexión.

## Estructura

| Archivo | Para qué |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | Interfaz (7 secciones: Inicio, Costos, Parcelas, Precios, Siembra, Escenarios, Datos) y pantalla de ingreso |
| `api.js` | Cliente de la API (`fetch` a `/api/*`) |
| `calc.js` | Cálculos (equilibrio, estacionalidad, plan de siembra, CSV). Sin DOM, se puede probar con Node |
| `api/auth.js`, `state.js`, `finca.js`, `parcelas.js`, `precios.js`, `_lib.js` | Registro/ingreso, lectura de datos, guardado de finca y costos, parcelas, precios |
| `db/migrations/*.sql`, `db/migrate.js` | Esquema de la base y script para aplicarlo |
| `db/seed.js` | Cuentas y datos **simulados** para pruebas (Utcubamba/Bagua, Amazonas) |
| `sw.js`, `manifest.webmanifest`, `icon*` | Instalable y sin conexión (`/api` nunca se cachea) |
| `vercel.json` | Cabeceras y URLs limpias; solo `main` despliega automáticamente desde GitHub |
| `.env.example` | Plantilla de variables de entorno |

## Puesta en marcha

Requiere Node 20 o superior y una cuenta en [neon.com](https://neon.com) y [vercel.com](https://vercel.com).

1. **Neon:** crea un proyecto y copia la cadena de conexión del *pooler*. Se recomienda una rama para desarrollo y otra para producción.
2. **Instalar:** `npm install`.
3. **Crear las tablas:** con la cadena de la base elegida, `npm run db:migrate`. En Git Bash:

   ```bash
   DATABASE_URL='<cadena>' npm run db:migrate
   ```

   Los scripts de `db/` **no leen `.env.local`**: toman `DATABASE_URL` de la terminal.
4. **Datos de prueba (solo desarrollo):** `DATABASE_URL='<cadena de dev>' npm run db:seed`. Es seguro repetirlo: recrea las cuentas demo.

### Probar en local

Usa `vercel dev` (no `npx serve`, porque no ejecuta `/api/*`). Pon la cadena de desarrollo en `.env.local` (está en `.gitignore`; ver `.env.example`) y abre `http://localhost:3000`.

Cuentas demo: `demo1@chacraclara.pe`, `demo2@chacraclara.pe`, `demo3@chacraclara.pe`, contraseña `ChacraDemo2026`. Son solo para desarrollo.

### Publicar en Vercel

1. Importa el repositorio en Vercel (Framework Preset: **Other**, sin Build Command ni Output Directory).
2. En Settings → Environment Variables crea `DATABASE_URL` con un valor por entorno:

   | Entorno | Se usa en | Valor |
   | --- | --- | --- |
   | **Production** | deploys de `main` | base de producción |
   | **Preview** | deploys de otras ramas (ej. `develop`) | base de desarrollo |
   | **Development** | solo `vercel dev` / `vercel env pull` | base de desarrollo |

   Marca Production y Preview como **Sensitive**. Después de cambiar variables hay que hacer un **redeploy**.
3. `vercel.json` solo permite despliegues automáticos de `main`. Para que `develop` también despliegue, cambia `"*": false` por `"develop": true` en `git.deploymentEnabled`.
4. Si cambias archivos de la app, sube la versión de `CACHE` en `sw.js` (hoy `chacra-clara-v3`) para que los celulares reciban la actualización.

### Producción

- Aplica solo `db:migrate` con la cadena de producción. **No corras `db:seed` en producción**: crearía cuentas demo con una contraseña conocida.
- No guardes la cadena de producción en `.env.local`.
- Usa un rol de Neon distinto de `neondb_owner` para la app, y activa los respaldos de Neon (restauración a un punto en el tiempo).
- Las cuentas se crean con el registro de la propia app (contraseña de mínimo 8 caracteres, guardada con scrypt; sesión por cookie `HttpOnly`, y límite de intentos de ingreso).

## Cómo usarla con los datos reales

1. **Costos:** pon las hectáreas de la finca, los costos por hectárea de la última campaña, el rendimiento prudente (promedio de campañas) y la meta de ganancia.
2. **Parcelas:** divide las hectáreas en parcelas e indica variedad y fecha de siembra.
3. **Precios:** registra el **precio en chacra** que pagan los molinos de la zona (llamadas, vecinos, boletas de venta). Los boletines de MIDAGRI sirven de referencia mayorista, pero no son lo que cobra el productor. Para cargar años pasados, pega líneas o sube un CSV (`data/plantilla-precios.csv`).
4. **Siembra:** con 3 años o más de precios mensuales, la estacionalidad empieza a ser útil. Completa agua y lluvia por mes con la experiencia local y SENAMHI.
5. **Escenarios:** prueba un caso malo (rendimiento bajo y precio bajo) antes de decidir.

## Limitaciones y riesgos

- No predice precios. Resume lo que pasó en años anteriores y muestra rangos.
- La calidad depende de los datos: pocos años o precios mal anotados dan conclusiones débiles.
- Los precios históricos no están ajustados por inflación.
- No modela plagas, inundaciones, sequías, humedad del grano ni cambios de política (aranceles, importaciones).
- Los precios `SIMULADO` son inventados para probar la herramienta; no los uses para decidir.
- Aún no hay recuperación de contraseña ni verificación de correo.
- Parcelas y precios necesitan conexión; solo costos, finca, riesgos y escenarios se guardan sin señal.

## Siguientes pasos

- **Recuperación de contraseña** y verificación de correo.
- **Precios compartidos reales:** que varios agricultores aporten precios en chacra anónimos por zona (la tabla `precios` ya admite precios de referencia por región).
- **Alertas por WhatsApp** cuando el precio supere el equilibrio o la meta (requiere servicio de mensajería y un servidor que revise precios).
- **Lectura automática de los boletines PDF de MIDAGRI** para alimentar el precio mayorista. Los formatos cambian, así que habría que vigilarlo.
- **Pronóstico estadístico** solo después de comprobar con datos pasados que acierta mejor que "el mismo mes de otros años".
