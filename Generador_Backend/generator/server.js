require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const archiver = require("archiver");
const { generateScreen } = require("./src/uiSpecAssistant");

const { generateBackend } = require("./src/generate");
const { interpretCommand, summarizeDiagram } = require("./src/aiAssistant");
const { interpretDiagramImage } = require("./src/imageImport");
const http = require("http");
const { setupCollaboration } = require("./src/collaboration");

const app = express();
const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
setupCollaboration(server);

app.use(cors()); // el editor React corre en otro puerto (5173), necesita CORS habilitado
app.use(express.json({ limit: "12mb" })); // las imágenes en base64 pesan más que el JSON del diagrama

/**
 * POST /api/generate
 * Body: el diagrama JSON (mismo formato que usa el CLI del generador).
 * Respuesta: un .zip con el proyecto Spring Boot generado, listo para
 * descomprimir y abrir en el IDE.
 */
app.post("/api/generate", (req, res) => {
  const diagram = req.body;

  if (!diagram || !diagram.entities || diagram.entities.length === 0) {
    return res.status(400).json({ error: "El diagrama no tiene entidades para generar." });
  }

  // Carpeta temporal única por request, para no pisar generaciones concurrentes.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "backend-gen-"));
  const projectFolderName = (diagram.projectName || "backend").replace(/[^a-zA-Z0-9-_]/g, "");
  const outputDir = path.join(tempDir, projectFolderName);

  try {
    generateBackend(diagram, outputDir);
  } catch (err) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return res.status(400).json({ error: err.message });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${projectFolderName}.zip"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    console.error("Error al comprimir el backend generado:", err);
    res.status(500).end();
  });

  // Limpiar la carpeta temporal una vez que terminó de enviarse la respuesta.
  archive.on("end", () => {
    fs.rm(tempDir, { recursive: true, force: true }, () => {});
  });

  archive.pipe(res);
  archive.directory(outputDir, projectFolderName);
  archive.finalize();
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * POST /api/assistant/command
 * Body: { diagram: <diagrama actual>, command: "agrega una tabla Cliente..." }
 * Respuesta: { message, operations }
 *
 * Importante: este endpoint NO modifica el diagrama. Solo traduce la
 * instrucción en una lista de operaciones. Quien aplica esas operaciones
 * sobre el estado real es el frontend (ver applyOperations en
 * react-editor/src/model/diagram.js) — así la IA nunca tiene control directo
 * sobre los datos, solo propone cambios que el sistema valida y ejecuta.
 */
app.post("/api/assistant/command", async (req, res) => {
  const { diagram, command } = req.body || {};

  if (!command || !command.trim()) {
    return res.status(400).json({ error: "Falta el campo 'command' (la instrucción en lenguaje natural)." });
  }

  try {
    const summary = summarizeDiagram(diagram || { entities: [], relationships: [] });
    const result = await interpretCommand(command, summary);
    res.json(result);
  } catch (err) {
    console.error("Error interpretando comando de IA:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/assistant/import-image
 * Body: { imageBase64: "...", mimeType: "image/png" }
 * Respuesta: { message, operations } — mismo contrato que /api/assistant/command,
 * así que el frontend aplica el resultado con la misma función applyOperations.
 */
app.post("/api/assistant/import-image", async (req, res) => {
  const { imageBase64, mimeType } = req.body || {};

  if (!imageBase64 || !mimeType) {
    return res.status(400).json({ error: "Se requiere 'imageBase64' y 'mimeType' en el body." });
  }

  try {
    const result = await interpretDiagramImage(imageBase64, mimeType);
    res.json(result);
  } catch (err) {
    console.error("Error interpretando imagen del diagrama:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/assistant/generate-screen
 * Body: { command: "...", availableEntities: [{name, fields}] }
 * Respuesta: { message, screenSpec }
 */
app.post("/api/assistant/generate-screen", async (req, res) => {
  const { command, availableEntities } = req.body || {};

  if (!command || !Array.isArray(availableEntities)) {
    return res.status(400).json({ error: "Se requiere 'command' y 'availableEntities' (array) en el body." });
  }

  try {
    const result = await generateScreen(command, availableEntities);
    res.json(result);
  } catch (err) {
    console.error("Error generando pantalla:", err.message);
    res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`✔ Servidor del generador escuchando en http://localhost:${PORT}`);
  console.log(`  Probalo con: POST http://localhost:${PORT}/api/generate`);
});