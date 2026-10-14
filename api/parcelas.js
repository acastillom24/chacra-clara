const { db, send, route, fincaDe, num, txt } = require('./_lib');

const ESTADOS = ['activa', 'barbecho', 'cosechada'];
const COLS = 'id, codigo, nombre, ha, rend, cultivo, variedad, fecha_siembra::text AS fecha_siembra, estado';

function limpiar(b) {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha_siembra || '')) ? b.fecha_siembra : null;
  return {
    codigo: txt(b.codigo, 20),
    nombre: txt(b.nombre, 80),
    ha: Math.round(num(b.ha) * 100) / 100,
    rend: b.rend === null || b.rend === '' || b.rend === undefined ? null : Math.max(num(b.rend), 0),
    cultivo: txt(b.cultivo, 40) || 'Arroz',
    variedad: txt(b.variedad, 60),
    fecha_siembra: fecha,
    estado: ESTADOS.indexOf(b.estado) >= 0 ? b.estado : 'activa'
  };
}

function out(p) {
  return { id: p.id, codigo: p.codigo, nombre: p.nombre, ha: num(p.ha), rend: p.rend == null ? null : num(p.rend), cultivo: p.cultivo, variedad: p.variedad, fecha_siembra: p.fecha_siembra, estado: p.estado };
}

// POST crea, PUT edita, DELETE (?id=) borra. Las hectáreas de las parcelas no pueden superar las de la finca.
module.exports = route(['POST', 'PUT', 'DELETE'], async (req, res, { user, body }) => {
  const sql = db();
  const f = await fincaDe(user.id);

  if (req.method === 'DELETE') {
    const id = String((req.query && req.query.id) || '');
    await sql.query('DELETE FROM parcelas WHERE id = $1::uuid AND finca_id = $2', [id, f.id]);
    return send(res, 200, { ok: true });
  }

  const p = limpiar(body);
  if (!(p.ha > 0)) return send(res, 400, { error: 'Indica las hectáreas de la parcela (mayor que 0)' });

  if (req.method === 'POST') {
    // Código automático P-01, P-02… si no se indica
    if (!p.codigo) {
      const n = (await sql.query("SELECT coalesce(max(substring(codigo from '[0-9]+$')::int), 0) + 1 AS n FROM parcelas WHERE finca_id = $1 AND codigo ~ '[0-9]+$'", [f.id]))[0].n;
      p.codigo = 'P-' + String(n).padStart(2, '0');
    }
    const r = await sql.query(
      `INSERT INTO parcelas(finca_id, codigo, nombre, ha, rend, cultivo, variedad, fecha_siembra, estado)
       SELECT $1::uuid, $2::text, $3::text, $4::numeric, $5::numeric, $6::text, $7::text, $8::date, $9::text
       WHERE (SELECT coalesce(sum(ha), 0) FROM parcelas WHERE finca_id = $1::uuid) + $4::numeric <= (SELECT ha_total FROM fincas WHERE id = $1)
       ON CONFLICT (finca_id, codigo) DO NOTHING
       RETURNING ${COLS}`,
      [f.id, p.codigo, p.nombre, p.ha, p.rend, p.cultivo, p.variedad, p.fecha_siembra, p.estado]
    );
    if (!r.length) return send(res, 409, { error: await motivo(sql, f, p, null) });
    return send(res, 201, { parcela: out(r[0]) });
  }

  // PUT
  const id = String(body.id || '');
  if (!p.codigo) return send(res, 400, { error: 'El código es obligatorio' });
  const r = await sql.query(
    `UPDATE parcelas SET codigo = $3, nombre = $4, ha = $5, rend = $6, cultivo = $7, variedad = $8, fecha_siembra = $9, estado = $10
     WHERE id = $1::uuid AND finca_id = $2
       AND (SELECT coalesce(sum(ha), 0) FROM parcelas WHERE finca_id = $2 AND id <> $1::uuid) + $5 <= (SELECT ha_total FROM fincas WHERE id = $2)
       AND NOT EXISTS (SELECT 1 FROM parcelas WHERE finca_id = $2 AND codigo = $3 AND id <> $1::uuid)
     RETURNING ${COLS}`,
    [id, f.id, p.codigo, p.nombre, p.ha, p.rend, p.cultivo, p.variedad, p.fecha_siembra, p.estado]
  );
  if (!r.length) return send(res, 409, { error: await motivo(sql, f, p, id) });
  send(res, 200, { parcela: out(r[0]) });
});

async function motivo(sql, f, p, selfId) {
  const dup = await sql.query('SELECT 1 FROM parcelas WHERE finca_id = $1 AND codigo = $2 AND ($3::text IS NULL OR id::text <> $3)', [f.id, p.codigo, selfId]);
  if (dup.length) return 'Ya existe una parcela con el código ' + p.codigo;
  const s = (await sql.query('SELECT coalesce(sum(ha), 0) AS s FROM parcelas WHERE finca_id = $1 AND ($2::text IS NULL OR id::text <> $2)', [f.id, selfId]))[0].s;
  const libres = Math.max(num(f.ha_total) - num(s), 0);
  return 'No alcanzan las hectáreas: la finca tiene ' + num(f.ha_total) + ' ha y quedan ' + libres + ' ha libres. Ajusta las hectáreas en Costos o reduce esta parcela.';
}
