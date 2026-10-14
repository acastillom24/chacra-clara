const { db, send, route, fincaDe, num } = require('./_lib');

module.exports = route(['GET'], async (req, res, { user }) => {
  const sql = db();
  const f = await fincaDe(user.id);
  if (!f) return send(res, 404, { error: 'Sin finca' });
  const [costs, parcelas, prices] = await Promise.all([
    sql.query('SELECT id, nombre, monto FROM costos WHERE finca_id = $1 ORDER BY orden', [f.id]),
    sql.query('SELECT id, codigo, nombre, ha, rend, cultivo, variedad, fecha_siembra::text AS fecha_siembra, estado FROM parcelas WHERE finca_id = $1 ORDER BY codigo', [f.id]),
    sql.query(
      'SELECT id, fecha::text AS fecha, precio, tipo, fuente, (finca_id IS NULL) AS shared FROM precios WHERE finca_id = $1 OR (finca_id IS NULL AND region = $2) ORDER BY fecha',
      [f.id, f.region]
    )
  ]);
  const riesgos = [];
  for (let i = 0; i < 12; i++) riesgos.push(Object.assign({ agua: 'na', lluvia: 'na' }, (f.riesgos || [])[i] || {}));
  send(res, 200, {
    user: { email: user.email, nombre: user.nombre },
    finca: { nombre: f.nombre, lugar: f.lugar, region: f.region, ha: num(f.ha_total), rend: num(f.rend), ciclo: f.ciclo, meta: num(f.meta) },
    costs: costs.map((c) => ({ id: c.id, nombre: c.nombre, monto: num(c.monto) })),
    parcelas: parcelas.map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, ha: num(p.ha), rend: p.rend == null ? null : num(p.rend), cultivo: p.cultivo, variedad: p.variedad, fecha_siembra: p.fecha_siembra, estado: p.estado })),
    prices: prices.map((p) => ({ id: p.id, fecha: p.fecha, precio: num(p.precio), tipo: p.tipo, fuente: p.fuente, shared: p.shared })),
    riesgos,
    esc: f.esc || null
  });
});
