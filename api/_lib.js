const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

let _sql;
function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('Falta la variable DATABASE_URL');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

const COOKIE = 'cc_session';
const SESSION_DAYS = 30;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setCookie(res, token, maxAgeSec) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE + '=' + (token || '') + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + maxAgeSec + secure);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}
function checkPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db().query(
    "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)",
    [sha(token), userId, String(SESSION_DAYS)]
  );
  setCookie(res, token, SESSION_DAYS * 86400);
}

async function getUser(req) {
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  const r = await db().query(
    'SELECT u.id, u.email, u.nombre FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()',
    [sha(token)]
  );
  return r[0] || null;
}

/* Envuelve un handler: método permitido, JSON en escrituras (frena CSRF), sesión y errores. */
function route(methods, handler, opts) {
  return async (req, res) => {
    try {
      if (methods.indexOf(req.method) < 0) { res.setHeader('Allow', methods.join(', ')); return send(res, 405, { error: 'Método no permitido' }); }
      if (req.method !== 'GET' && !String(req.headers['content-type'] || '').startsWith('application/json')) {
        return send(res, 415, { error: 'Se requiere JSON' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      let user = null;
      if (!(opts && opts.public)) {
        user = await getUser(req);
        if (!user) return send(res, 401, { error: 'Sesión requerida' });
      }
      await handler(req, res, { user, body });
    } catch (e) {
      console.error(e);
      send(res, 500, { error: 'Error del servidor' });
    }
  };
}

async function fincaDe(userId) {
  const r = await db().query('SELECT * FROM fincas WHERE user_id = $1', [userId]);
  return r[0] || null;
}

const num = (v, d) => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : (d || 0); };
const txt = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 120);

const DEFAULT_COSTS = [
  'Preparación del terreno (fangueo, nivelación)', 'Semilla', 'Almácigo y trasplante', 'Fertilizantes',
  'Agroquímicos (herbicidas, fungicidas, insecticidas)', 'Agua de riego (tarifa)', 'Mano de obra',
  'Cosecha (máquina, jornales)', 'Transporte y secado', 'Costo de la tierra (alquiler o equivalente)', 'Imprevistos y otros'
];

module.exports = { db, send, route, hashPassword, checkPassword, createSession, setCookie, cookies, sha, fincaDe, num, txt, COOKIE, DEFAULT_COSTS };
