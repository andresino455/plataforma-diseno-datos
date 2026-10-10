#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { generateBackend } = require("./src/generate");

const [, , diagramPath, outputDirArg] = process.argv;

if (!diagramPath) {
  console.error("Uso: node index.js <diagrama.json> [carpeta-salida]");
  process.exit(1);
}

const diagram = JSON.parse(fs.readFileSync(diagramPath, "utf-8"));
const outputDir = outputDirArg || path.join(__dirname, "output", diagram.projectName || "backend");

generateBackend(diagram, outputDir);
