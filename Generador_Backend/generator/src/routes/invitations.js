const express = require("express");
const db = require("../db");

// Invitaciones recibidas por el usuario logueado (se buscan por su correo).
const router = express.Router();

function findMine(req) {
  return db
    .prepare("SELECT id, project_id, email FROM invitations WHERE id = ? AND email = ?")
    .get(req.params.id, req.user.email);
}

router.get("/", (req, res) => {
  const invitations = db
    .prepare(
      `SELECT i.id, i.created_at, p.id AS project_id, p.name AS project_name, u.name AS invited_by_name
         FROM invitations i
         JOIN projects p ON p.id = i.project_id
         JOIN users u ON u.id = i.invited_by
        WHERE i.email = ?
        ORDER BY i.created_at DESC`
    )
    .all(req.user.email);
  res.json({ invitations });
});

router.post("/:id/accept", (req, res) => {
  const invitation = findMine(req);
  if (!invitation) return res.status(404).json({ error: "La invitación ya no existe." });

  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, 'editor')").run(
      invitation.project_id,
      req.user.id
    );
    db.prepare("DELETE FROM invitations WHERE id = ?").run(invitation.id);
  })();

  res.json({ projectId: invitation.project_id });
});

router.post("/:id/decline", (req, res) => {
  const invitation = findMine(req);
  if (!invitation) return res.status(404).json({ error: "La invitación ya no existe." });
  db.prepare("DELETE FROM invitations WHERE id = ?").run(invitation.id);
  res.json({ ok: true });
});

module.exports = router;
