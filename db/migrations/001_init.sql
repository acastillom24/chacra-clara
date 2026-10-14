-- Chacra Clara · esquema inicial (Neon / Postgres)
-- Cada sentencia termina en ';' y sin cuerpos de función: db/migrate.js las ejecuta una por una.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  nombre text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  email text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts(email, at);

CREATE TABLE IF NOT EXISTS fincas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  nombre text NOT NULL DEFAULT 'Mi finca',
  lugar text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT 'Amazonas',
  ha_total numeric(10,2) NOT NULL DEFAULT 0 CHECK (ha_total >= 0),
  rend numeric(10,2) NOT NULL DEFAULT 0 CHECK (rend >= 0),
  ciclo int NOT NULL DEFAULT 135 CHECK (ciclo BETWEEN 30 AND 400),
  meta numeric(6,2) NOT NULL DEFAULT 20,
  riesgos jsonb NOT NULL DEFAULT '[]'::jsonb,
  esc jsonb
);

CREATE TABLE IF NOT EXISTS parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text NOT NULL DEFAULT '',
  ha numeric(10,2) NOT NULL CHECK (ha > 0),
  rend numeric(10,2) CHECK (rend IS NULL OR rend >= 0),
  cultivo text NOT NULL DEFAULT 'Arroz',
  variedad text NOT NULL DEFAULT '',
  fecha_siembra date,
  estado text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','barbecho','cosechada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (finca_id, codigo)
);

CREATE TABLE IF NOT EXISTS costos (
  finca_id uuid NOT NULL REFERENCES fincas(id) ON DELETE CASCADE,
  id text NOT NULL,
  nombre text NOT NULL DEFAULT '',
  monto numeric(12,2) NOT NULL DEFAULT 0,
  orden int NOT NULL DEFAULT 0,
  PRIMARY KEY (finca_id, id)
);

-- finca_id NULL = precio de referencia compartido para la región (simulado o importado por un administrador).
CREATE TABLE IF NOT EXISTS precios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id) ON DELETE CASCADE,
  region text NOT NULL DEFAULT 'Amazonas',
  fecha date NOT NULL,
  precio numeric(8,3) NOT NULL CHECK (precio > 0 AND precio <= 50),
  tipo text NOT NULL CHECK (tipo IN ('chacra','mayorista')),
  fuente text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS precios_finca_idx ON precios(finca_id);

CREATE INDEX IF NOT EXISTS precios_region_idx ON precios(region) WHERE finca_id IS NULL;
