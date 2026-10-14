const { db, send, route, fincaDe, num, txt } = require('./_lib');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// POST { rows: [{fecha, precio, tipo, fuente}] } agrega precios propios (máx. 500). DELETE ?id= borra uno propio.
module.exports = route(['POST', 'DELETE'], async (req, res, { user, body }) => {
  const sql = db();
  const f = await fincaDe(user.id);

  if (req.method === 'DELETE') {
    const id = String((req.query && req.query.id) || '');
    await sql.query('DELETE FROM precios WHERE id = $1::uuid AND finca_id = $2', [id, f.id]); // los compartidos no se pueden borrar
    return send(res, 200, { ok: true });
  }

  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 500).map((r) => ({
    fecha: String(r.fecha || ''), precio: Math.round(num(r.precio) * 1000) / 1000,
    tipo: r.tipo === 'mayorista' ? 'mayorista' : 'chacra', fuente: txt(r.fuente, 80)
  })).filter((r) => FECHA.test(r.fecha) && r.precio > 0 && r.precio <= 50);
  if (!rows.length) return send(res, 400, { error: 'No hay precios válidos' });

  const inserted = await sql.query(
    `INSERT INTO precios(finca_id, region, fecha, precio, tipo, fuente)
     SELECT $1, $2, x.fecha::date, x.precio, x.tipo, x.fuente
     FROM jsonb_to_recordset($3::jsonb) AS x(fecha text, precio numeric, tipo text, fuente text)
     RETURNING id, fecha::text AS fecha, precio, tipo, fuente`,
    [f.id, f.region, JSON.stringify(rows)]
  );
  send(res, 201, { prices: inserted.map((p) => ({ id: p.id, fecha: p.fecha, precio: num(p.precio), tipo: p.tipo, fuente: p.fuente, shared: false })) });
});
