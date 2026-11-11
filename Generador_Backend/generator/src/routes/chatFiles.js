const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();

const UPLOAD_DIR = path.join(db.DATA_DIR, "chat-uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const isMember = db.prepare(`
  SELECT 1 FROM project_members
  WHERE project_id = ? AND user_id = ?
`);

const allowedTypes = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  audio: ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"],
};

const extensions = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
  "audio/mpeg": ".mp3",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const kind = req.body.kind;

    if (!allowedTypes[kind]?.includes(file.mimetype)) {
      return cb(new Error("Formato de archivo no permitido."));
    }

    cb(null, true);
  },
});

// Subir archivo
router.post("/:projectId/files", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const { projectId } = req.params;

    const membership = isMember.get(projectId, req.user.id);

    console.log("=== DEBUG CHAT FILES ===");
    console.log("Project ID recibido:", projectId);
    console.log("Usuario autenticado:", req.user);
    console.log("Membresía encontrada:", membership);
    console.log("========================");

    if (!membership) {
      return res.status(403).json({
        error: "No pertenecés al proyecto.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No se recibió archivo." });
    }

    const kind = req.body.kind;
    const maxSize = kind === "image" ? 8 * 1024 * 1024 : 12 * 1024 * 1024;

    if (req.file.size > maxSize) {
      return res.status(413).json({ error: "Archivo demasiado grande." });
    }

    const filename = crypto.randomUUID() + extensions[req.file.mimetype];

    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer, {
      flag: "wx",
    });

    res.status(201).json({
      attachment: {
        filename,
        kind,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/api/chat/${projectId}/files/${filename}`,
      },
    });
  });
});

// Consultar archivo: solo los miembros del proyecto pueden acceder
router.get("/:projectId/files/:filename", (req, res) => {
  const { projectId, filename } = req.params;

  if (!isMember.get(projectId, req.user.id)) {
    return res.sendStatus(403);
  }

  if (
    !/^[a-f0-9-]+\.(jpg|png|webp|gif|webm|ogg|m4a|wav|mp3)$/i.test(filename)
  ) {
    return res.sendStatus(404);
  }

  const filePath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.sendStatus(404);
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(filePath);
});

module.exports = router;
