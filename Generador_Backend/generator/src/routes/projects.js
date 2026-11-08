const express = require("express");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getMembership = db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?");

function collab(req) {
  return req.app.locals.collab;
}

function validName(value) {
  const name = String(value ?? "").trim();
  return name.length >= 1 && name.length <= 80 ? name : null;
}

// Carga el rol del usuario en el proyecto o responde con error.
function loadMembership(req, res) {
  const role = getMembership.get(req.params.id, req.user.id)?.role;
  if (!role) {
    res.status(404).json({
      error: "No existe este proyecto o no tenés acceso. Pedile al dueño que te invite con tu correo.",
    });
    return null;
  }
  return role;
}

function requireOwner(req, res) {
  const role = loadMembership(req, res);
  if (!role) return null;
  if (role !== "owner") {
    res.status(403).json({ error: "Solo el dueño del proyecto puede hacer esto." });
    return null;
  }
  return role;
}

function listMembers(projectId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, m.role
         FROM project_members m JOIN users u ON u.id = m.user_id
        WHERE m.project_id = ?
        ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, u.name`
    )
    .all(projectId);
}

function listInvitations(projectId) {
  return db
    .prepare("SELECT id, email, created_at FROM invitations WHERE project_id = ? ORDER BY created_at")
    .all(projectId);
}

// ── Proyectos ────────────────────────────────────────────────────────────────

router.get("/", (req, res) => {
  const projects = db
    .prepare(
      `SELECT p.id, p.name, p.updated_at, m.role, u.name AS owner_name
         FROM project_members m
         JOIN projects p ON p.id = m.project_id
         JOIN users u ON u.id = p.owner_id
        WHERE m.user_id = ?
        ORDER BY p.updated_at DESC`
    )
    .all(req.user.id);
  res.json({ projects });
});

router.post("/", (req, res) => {
  const name = validName(req.body?.name);
  if (!name) return res.status(400).json({ error: "Poné un nombre para el proyecto (hasta 80 caracteres)." });

  const id = crypto.randomUUID();
  db.transaction(() => {
    db.prepare("INSERT INTO projects (id, name, owner_id) VALUES (?, ?, ?)").run(id, name, req.user.id);
    db.prepare("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')").run(id, req.user.id);
  })();

  res.status(201).json({ project: { id, name, role: "owner" } });
});

router.get("/:id", (req, res) => {
  const role = loadMembership(req, res);
  if (!role) return;

  const row = db.prepare("SELECT id, name, diagram, owner_id FROM projects WHERE id = ?").get(req.params.id);
  let diagram = null;
  if (row.diagram) {
    try {
      diagram = JSON.parse(row.diagram);
    } catch {
      diagram = null;
    }
  }

  res.json({ project: { id: row.id, name: row.name, role, diagram } });
});

router.patch("/:id", (req, res) => {
  if (!requireOwner(req, res)) return;
  const name = validName(req.body?.name);
  if (!name) return res.status(400).json({ error: "Poné un nombre para el proyecto (hasta 80 caracteres)." });

  db.prepare("UPDATE projects SET name = ? WHERE id = ?").run(name, req.params.id);
  res.json({ ok: true, name });
});

router.delete("/:id", (req, res) => {
  if (!requireOwner(req, res)) return;
  collab(req)?.closeRoom(req.params.id);
  db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ── Miembros e invitaciones ──────────────────────────────────────────────────

router.get("/:id/members", (req, res) => {
  const role = loadMembership(req, res);
  if (!role) return;

  res.json({
    members: listMembers(req.params.id),
    // Las invitaciones pendientes (con los correos) solo las ve el dueño.
    invitations: role === "owner" ? listInvitations(req.params.id) : [],
  });
});

router.post("/:id/invitations", (req, res) => {
  if (!requireOwner(req, res)) return;

  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "El correo no es válido." });

  const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existingUser && getMembership.get(req.params.id, existingUser.id)) {
    return res.status(409).json({ error: "Esa persona ya es miembro del proyecto." });
  }

  const duplicate = db
    .prepare("SELECT 1 FROM invitations WHERE project_id = ? AND email = ?")
    .get(req.params.id, email);
  if (duplicate) return res.status(409).json({ error: "Ya enviaste una invitación a ese correo." });

  const id = crypto.randomUUID();
  db.prepare("INSERT INTO invitations (id, project_id, email, invited_by) VALUES (?, ?, ?, ?)").run(
    id,
    req.params.id,
    email,
    req.user.id
  );

  res.status(201).json({ invitation: { id, email }, userExists: Boolean(existingUser) });
});

router.delete("/:id/invitations/:invitationId", (req, res) => {
  if (!requireOwner(req, res)) return;
  db.prepare("DELETE FROM invitations WHERE id = ? AND project_id = ?").run(req.params.invitationId, req.params.id);
  res.json({ ok: true });
});

// El dueño puede sacar a cualquiera; cada miembro puede salirse por su cuenta.
// El dueño no puede salirse (tendría que eliminar el proyecto).
router.delete("/:id/members/:userId", (req, res) => {
  const role = loadMembership(req, res);
  if (!role) return;

  const targetId = req.params.userId;
  const isSelf = targetId === req.user.id;

  if (!isSelf && role !== "owner") {
    return res.status(403).json({ error: "Solo el dueño del proyecto puede quitar miembros." });
  }

  const targetRole = getMembership.get(req.params.id, targetId)?.role;
  if (!targetRole) return res.status(404).json({ error: "Esa persona no es miembro del proyecto." });
  if (targetRole === "owner") {
    return res.status(400).json({ error: "El dueño no puede salirse. Eliminá el proyecto si ya no lo necesitás." });
  }

  db.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?").run(req.params.id, targetId);
  collab(req)?.kickUser(req.params.id, targetId);
  res.json({ ok: true });
});

module.exports = router;
