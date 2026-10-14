// Datos SIMULADOS para Amazonas (Utcubamba / Bagua), Perú. No son datos reales.
// Uso: DATABASE_URL=... npm run db:seed   (idempotente: recrea las cuentas demo y los precios simulados)
const { neon } = require('@neondatabase/serverless');
const { hashPassword, DEFAULT_COSTS } = require('../api/_lib');

const PASSWORD = 'ChacraDemo2026';
const REGION = 'Amazonas';

// Montos S/ por hectárea por campaña, en el orden de DEFAULT_COSTS; "k" escala según la finca.
const BASE = [900, 450, 1100, 1500, 900, 250, 1200, 1000, 600, 800, 400];

const DEMOS = [
  {
    email: 'demo1@chacraclara.pe', nombre: 'Productor Demo 1', finca: 'Fundo La Esperanza', lugar: 'Bagua Grande, Utcubamba',
    ha: 30, rend: 8000, k: 1.0,
    parcelas: [
      ['P-01', 'Pampa alta', 12, 'IR-43', '2026-08-20', 'activa'],
      ['P-02', 'Cerca al canal', 10, 'Capoteña', '2026-09-05', 'activa'],
      ['P-03', 'Pampa baja', 8, 'IR-43', '2026-03-12', 'cosechada']
    ]
  },
  {
    email: 'demo2@chacraclara.pe', nombre: 'Productor Demo 2', finca: 'Chacra San Isidro', lugar: 'Jamalca, Utcubamba',
    ha: 18, rend: 7200, k: 0.93,
    parcelas: [
      ['P-01', 'Lote 1', 11, 'Capoteña', '2026-08-28', 'activa'],
      ['P-02', 'Lote 2', 7, 'Valor', null, 'barbecho']
    ]
  },
  {
    email: 'demo3@chacraclara.pe', nombre: 'Productor Demo 3', finca: 'Agrícola Río Utcubamba', lugar: 'Bagua, Bagua',
    ha: 45, rend: 8600, k: 1.1,
    parcelas: [
      ['P-01', 'Sector norte', 15, 'IR-43', '2026-08-10', 'activa'],
      ['P-02', 'Sector sur', 12, 'Valor', '2026-08-25', 'activa'],
      ['P-03', 'Ribera', 10, 'Capoteña', '2026-02-18', 'cosechada'],
      ['P-04', 'Lote nuevo', 8, '', null, 'barbecho']
    ]
  }
];

// Serie determinista de 36 meses: arroz cáscara, S/ por kg. Mínimos hacia la cosecha grande (abril-mayo).
function precios() {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const now = new Date(), out = [];
  for (let i = 36; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const m = d.getMonth();
    const chacra = 1.38 - 0.17 * Math.cos((m - 4) / 12 * 2 * Math.PI) + (rnd() - 0.5) * 0.12 + (36 - i) * 0.003;
    const f = d.getFullYear() + '-' + String(m + 1).padStart(2, '0') + '-15';
    out.push({ fecha: f, precio: Math.round(chacra * 100) / 100, tipo: 'chacra', fuente: 'SIMULADO' });
    out.push({ fecha: f, precio: Math.round((chacra + 0.32 + (rnd() - 0.5) * 0.05) * 100) / 100, tipo: 'mayorista', fuente: 'SIMULADO' });
  }
  return out;
}

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  const sql = neon(process.env.DATABASE_URL);

  await sql.query('DELETE FROM users WHERE email = ANY($1::text[])', [DEMOS.map((d) => d.email)]); // cascada: finca, parcelas, costos, precios propios
  await sql.query("DELETE FROM precios WHERE finca_id IS NULL AND region = $1 AND fuente = 'SIMULADO'", [REGION]);
  await sql.query(
    `INSERT INTO precios(finca_id, region, fecha, precio, tipo, fuente)
     SELECT NULL, $1, x.fecha::date, x.precio, x.tipo, x.fuente
     FROM jsonb_to_recordset($2::jsonb) AS x(fecha text, precio numeric, tipo text, fuente text)`,
    [REGION, JSON.stringify(precios())]
  );

  const hash = hashPassword(PASSWORD);
  for (const d of DEMOS) {
    const u = (await sql.query('INSERT INTO users(email, nombre, password_hash) VALUES ($1, $2, $3) RETURNING id', [d.email, d.nombre, hash]))[0];
    const riesgos = [];
    for (let i = 0; i < 12; i++) riesgos.push({
      agua: [11, 0, 1, 2, 3].indexOf(i) >= 0 ? 'buena' : [6, 7, 8].indexOf(i) >= 0 ? 'baja' : 'media',  // lluvias andinas dic-abr; estiaje jul-set
      lluvia: [0, 1, 2, 3].indexOf(i) >= 0 ? 'alto' : [5, 6, 7, 8].indexOf(i) >= 0 ? 'bajo' : 'medio'
    });
    const f = (await sql.query(
      `INSERT INTO fincas(user_id, nombre, lugar, region, ha_total, rend, ciclo, meta, riesgos)
       VALUES ($1, $2, $3, $4, $5, $6, 135, 20, $7::jsonb) RETURNING id`,
      [u.id, d.finca, d.lugar, REGION, d.ha, d.rend, JSON.stringify(riesgos)]
    ))[0];
    for (let i = 0; i < DEFAULT_COSTS.length; i++) {
      await sql.query('INSERT INTO costos(finca_id, id, nombre, monto, orden) VALUES ($1, $2, $3, $4, $5)',
        [f.id, 'c' + (i + 1), DEFAULT_COSTS[i], Math.round(BASE[i] * d.k / 10) * 10, i]);
    }
    for (const p of d.parcelas) {
      await sql.query(
        'INSERT INTO parcelas(finca_id, codigo, nombre, ha, cultivo, variedad, fecha_siembra, estado) VALUES ($1, $2, $3, $4, \'Arroz\', $5, $6, $7)',
        [f.id, p[0], p[1], p[2], p[3], p[4], p[5]]
      );
    }
    // Un par de precios propios en chacra, recientes
    await sql.query(
      "INSERT INTO precios(finca_id, region, fecha, precio, tipo, fuente) VALUES ($1, $2, current_date - 20, 1.52, 'chacra', 'Molino Bagua Grande (simulado)'), ($1, $2, current_date - 5, 1.48, 'chacra', 'Vecino (simulado)')",
      [f.id, REGION]
    );
    console.log('cuenta demo:', d.email, '·', d.ha, 'ha en', d.parcelas.length, 'parcelas');
  }
  console.log('Contraseña de las cuentas demo:', PASSWORD);
})().catch((e) => { console.error(e.message); process.exit(1); });
