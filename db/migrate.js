// Aplica db/migrations/*.sql en orden. Uso: DATABASE_URL=... npm run db:migrate
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  const sql = neon(process.env.DATABASE_URL);
  await sql.query('CREATE TABLE IF NOT EXISTS _migraciones (nombre text PRIMARY KEY, aplicada timestamptz NOT NULL DEFAULT now())');
  const dir = path.join(__dirname, 'migrations');
  const done = new Set((await sql.query('SELECT nombre FROM _migraciones')).map((r) => r.nombre));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) { console.log('ya aplicada:', f); continue; }
    const stmts = fs.readFileSync(path.join(dir, f), 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
      .split(';').map((s) => s.trim()).filter(Boolean);
    for (const s of stmts) await sql.query(s);
    await sql.query('INSERT INTO _migraciones(nombre) VALUES ($1)', [f]);
    console.log('aplicada:', f, '(' + stmts.length + ' sentencias)');
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
