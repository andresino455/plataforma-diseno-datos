const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// La base de datos es un único archivo local (data/app.db). No hay que
// instalar ni configurar nada: se crea sola la primera vez que arranca el
// servidor. La carpeta "data/" está en el .gitignore (contiene contraseñas
// hasheadas y proyectos de los usuarios).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diagram    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Quién puede abrir cada proyecto. El dueño también figura acá (role = 'owner').
  CREATE TABLE IF NOT EXISTS project_members (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'editor',
    joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, user_id)
  );

  -- Invitaciones pendientes, por correo. Sirven aunque la persona todavía
  -- no tenga cuenta: le aparecen cuando se registre con ese correo.
  CREATE TABLE IF NOT EXISTS invitations (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    email      TEXT NOT NULL,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (project_id, email)
  );

  CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

  -- Chat grupal del proyecto (lo ven todos los miembros). Los mensajes de la
  -- IA tienen user_id NULL y role = 'assistant'; si proponen cambios al
  -- diagrama, quedan en "operations" (JSON) hasta que alguien los aplique.
CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  operations TEXT,
  attachment TEXT,
  applied_by TEXT,
  created_at TEXT NOT NULL
);

  CREATE INDEX IF NOT EXISTS idx_chat_project ON chat_messages(project_id, id);
`);

const chatColumns = db
  .prepare("PRAGMA table_info(chat_messages)")
  .all()
  .map((column) => column.name);

if (!chatColumns.includes("attachment")) {
  db.exec("ALTER TABLE chat_messages ADD COLUMN attachment TEXT");
}
module.exports = db;
module.exports.DATA_DIR = DATA_DIR;
