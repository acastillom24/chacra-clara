const { db, send, route, hashPassword, checkPassword, createSession, setCookie, cookies, sha, COOKIE, DEFAULT_COSTS, txt } = require('./_lib');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = route(['POST'], async (req, res, { body }) => {
  const sql = db();
  const action = body.action;

  if (action === 'logout') {
    const t = cookies(req)[COOKIE];
    if (t) await sql.query('DELETE FROM sessions WHERE token_hash = $1', [sha(t)]);
    setCookie(res, '', 0);
    return send(res, 200, { ok: true });
  }

  const email = txt(body.email, 160).toLowerCase();
  const password = String(body.password || '');
  if (!EMAIL.test(email)) return send(res, 400, { error: 'Correo no válido' });

  if (action === 'register') {
    if (password.length < 8 || password.length > 100) return send(res, 400, { error: 'La contraseña debe tener entre 8 y 100 caracteres' });
    const exists = await sql.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.length) return send(res, 409, { error: 'Ese correo ya tiene una cuenta' });
    const u = (await sql.query(
      'INSERT INTO users(email, nombre, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [email, txt(body.nombre, 80), hashPassword(password)]
    ))[0];
    const f = (await sql.query(
      'INSERT INTO fincas(user_id, nombre, lugar, region) VALUES ($1, $2, $3, $4) RETURNING id',
      [u.id, txt(body.finca, 80) || 'Mi finca', txt(body.lugar, 120), 'Amazonas']
    ))[0];
    await sql.query(
      "INSERT INTO costos(finca_id, id, nombre, monto, orden) SELECT $1, 'c' || ord, n, 0, ord FROM unnest($2::text[]) WITH ORDINALITY AS t(n, ord)",
      [f.id, DEFAULT_COSTS]
    );
    await createSession(res, u.id);
    return send(res, 201, { ok: true });
  }

  if (action === 'login') {
    const recent = await sql.query("SELECT count(*)::int AS n FROM login_attempts WHERE email = $1 AND at > now() - interval '15 minutes'", [email]);
    if (recent[0].n >= 8) return send(res, 429, { error: 'Demasiados intentos. Espera 15 minutos.' });
    const r = await sql.query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
    let ok = false;
    if (r[0]) ok = checkPassword(password, r[0].password_hash);
    else checkPassword(password, 'scrypt$00$00'); // costo similar si el correo no existe
    if (!ok) {
      await sql.query('INSERT INTO login_attempts(email) VALUES ($1)', [email]);
      return send(res, 401, { error: 'Correo o contraseña incorrectos' });
    }
    await sql.query('DELETE FROM login_attempts WHERE email = $1', [email]);
    await createSession(res, r[0].id);
    return send(res, 200, { ok: true });
  }

  send(res, 400, { error: 'Acción no válida' });
}, { public: true });
