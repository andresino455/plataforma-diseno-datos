const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { signToken, requireAuth } = require("../auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// Hash "de mentira" para comparar igual cuando el correo no existe y que el
// tiempo de respuesta no delate qué correos están registrados.
const DUMMY_HASH = bcrypt.hashSync("no-existe", 10);

// Freno básico contra fuerza bruta: máximo 10 intentos fallidos por correo
// cada 15 minutos (en memoria; se reinicia con el servidor).
const failedLogins = new Map(); // email -> { count, resetAt }
const MAX_FAILED = 10;
const WINDOW_MS = 15 * 60 * 1000;

function isBlocked(email) {
  const entry = failedLogins.get(email);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failedLogins.delete(email);
    return false;
  }
  return entry.count >= MAX_FAILED;
}

function registerFailure(email) {
  const entry = failedLogins.get(email);
  if (!entry || Date.now() > entry.resetAt) {
    failedLogins.set(email, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}

router.post("/register", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ error: "El nombre debe tener entre 2 y 60 caracteres." });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "El correo no es válido." });
  }
  if (password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` });
  }

  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "Ya existe una cuenta con ese correo." });
  }

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)").run(
      id,
      name,
      email,
      passwordHash
    );
  } catch {
    // Dos registros simultáneos con el mismo correo: gana el primero.
    return res.status(409).json({ error: "Ya existe una cuenta con ese correo." });
  }

  const user = { id, name, email };
  res.status(201).json({ token: signToken(user), user });
});

router.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (isBlocked(email)) {
    return res.status(429).json({ error: "Demasiados intentos fallidos. Probá de nuevo en unos minutos." });
  }

  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  const ok = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);

  if (!row || !ok) {
    registerFailure(email);
    return res.status(401).json({ error: "Correo o contraseña incorrectos." });
  }

  failedLogins.delete(email);
  res.json({ token: signToken(row), user: publicUser(row) });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
