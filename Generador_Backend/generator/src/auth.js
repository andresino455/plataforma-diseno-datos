const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("./db");

const TOKEN_TTL = "7d";

let cachedSecret = null;

// El secreto con el que se firman las sesiones. Si no lo definís en el .env
// (JWT_SECRET), se genera uno al azar la primera vez y se guarda en
// data/jwt-secret.txt, así las sesiones sobreviven a reinicios del servidor.
function getSecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.JWT_SECRET) {
    cachedSecret = process.env.JWT_SECRET;
    return cachedSecret;
  }
  const file = path.join(db.DATA_DIR, "jwt-secret.txt");
  if (fs.existsSync(file)) {
    cachedSecret = fs.readFileSync(file, "utf8").trim();
  } else {
    cachedSecret = crypto.randomBytes(48).toString("hex");
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, getSecret(), { expiresIn: TOKEN_TTL });
}

// Devuelve el payload si el token es válido, o null.
function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

const findUserById = db.prepare("SELECT id, name, email FROM users WHERE id = ?");

// Middleware: exige "Authorization: Bearer <token>" y deja el usuario en req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verifyToken(token);
  const user = payload && findUserById.get(payload.sub);

  if (!user) {
    return res.status(401).json({ error: "Tenés que iniciar sesión para continuar." });
  }

  req.user = user;
  next();
}

module.exports = { signToken, verifyToken, requireAuth };
