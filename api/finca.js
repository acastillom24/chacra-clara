const { db, send, route, fincaDe, num, txt } = require('./_lib');

const ENUM_R = { agua: ['na', 'buena', 'media', 'baja'], lluvia: ['na', 'bajo', 'medio', 'alto'] };

// Guarda datos de la finca, costos (reemplazo completo), riesgos y escenarios.
module.exports = route(['PUT'], async (req, res, { user, body }) => {
  const sql = db();
  const f = await fincaDe(user.id);
  const b = body.finca || {};
  const ha = Math.min(Math.max(num(b.ha), 0), 100000);
  const costs = (Array.isArray(body.costs) ? body.costs : []).slice(0, 60);
  const riesgos = [];
  for (let i = 0; i < 12; i++) {
    const r = (body.riesgos || [])[i] || {};
    riesgos.push({
      agua: ENUM_R.agua.indexOf(r.agua) >= 0 ? r.agua : 'na',
      lluvia: ENUM_R.lluvia.indexOf(r.lluvia) >= 0 ? r.lluvia : 'na'
    });
  }
  let esc = null;
  if (body.esc && typeof body.esc === 'object') {
    esc = {};
    ['pes', 'base', 'opt'].forEach((k) => { const e = body.esc[k] || {}; esc[k] = { p: num(e.p), r: num(e.r) }; });
  }
  const stmts = [
    sql.query(
      'UPDATE fincas SET nombre = $2, lugar = $3, ha_total = $4, rend = $5, ciclo = $6, meta = $7, riesgos = $8::jsonb, esc = $9::jsonb WHERE id = $1',
      [f.id, txt(b.nombre, 80) || 'Mi finca', txt(b.lugar, 120), ha, Math.max(num(b.rend), 0),
        Math.min(Math.max(Math.round(num(b.ciclo, 135)), 30), 400), num(b.meta), JSON.stringify(riesgos), esc ? JSON.stringify(esc) : null]
    ),
    sql.query('DELETE FROM costos WHERE finca_id = $1', [f.id])
  ];
  const seen = {};
  costs.forEach((c, i) => {
    let id = txt(c.id, 40) || 'c' + (i + 1);
    if (seen[id]) id = id + '-' + i;
    seen[id] = 1;
    stmts.push(sql.query(
      'INSERT INTO costos(finca_id, id, nombre, monto, orden) VALUES ($1, $2, $3, $4, $5)',
      [f.id, id, txt(c.nombre, 120), Math.min(Math.max(num(c.monto), 0), 1e9), i]
    ));
  });
  await sql.transaction(stmts);
  send(res, 200, { ok: true });
});
