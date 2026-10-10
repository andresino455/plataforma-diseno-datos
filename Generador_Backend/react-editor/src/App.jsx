import { useMemo, useRef, useState } from "react";
import EntityCard from "./components/EntityCard";
import RelationshipCard from "./components/RelationshipCard";
import DiagramCanvas from "./components/DiagramCanvas";
import AssistantBar from "./components/AssistantBar";
import {
  createEmptyEntity,
  createEmptyRelationship,
  buildDiagramJson,
  applyOperations,
  SAMPLE_DIAGRAM,
} from "./model/diagram";
import { buildDrawioXml, parseDrawioXml } from "./model/drawio";
import {
  buildEaNativeXml,
  parseEaNativeXml,
  detectFormat,
} from "./model/eaNativeXml";
import "./App.css";
import { useCollaboration } from "./hooks/useCollaboration";
import CollaboratorsBar from "./components/CollaboratorsBar";
import "./styles/collaborators.css";
import { getOrCreateProjectId } from "./utils/projectId";
import ShareProjectButton from "./components/ShareProjectButton";

const initialEntity = createEmptyEntity(0);

const GENERATOR_API_URL = "http://localhost:4000/api/generate";
const ASSISTANT_API_URL = "http://localhost:4000/api/assistant/command";
const IMPORT_IMAGE_API_URL = "http://localhost:4000/api/assistant/import-image";

// Convierte un archivo de imagen a base64 puro (sin el prefijo "data:...;base64,").
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [projectName, setProjectName] = useState("TiendaOnline");
  const [basePackage, setBasePackage] = useState("com.tienda.generado");
  const [entities, setEntities] = useState([initialEntity]);
  const [relationships, setRelationships] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [previewView, setPreviewView] = useState("diagram"); // "diagram" | "json"
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState(null);
  const [assistantWarnings, setAssistantWarnings] = useState([]);
  const [assistantError, setAssistantError] = useState(null);
  const drawioFileInputRef = useRef(null);

  const diagramJson = useMemo(
    () => buildDiagramJson({ projectName, basePackage, entities, relationships }),
    [projectName, basePackage, entities, relationships]
  );
  
const [projectId] = useState(() => getOrCreateProjectId());

const { collaborators, myPresence, connected } = useCollaboration(
  diagramJson,
  (remoteDiagram) => {
    setProjectName(remoteDiagram.projectName ?? "");
    setBasePackage(remoteDiagram.basePackage ?? "");
    setEntities(remoteDiagram.entities ?? []);
    setRelationships(remoteDiagram.relationships ?? []);
  },
  projectId
);

  function updateEntity(entityId, updated) {
    setEntities((prev) => prev.map((e) => (e.id === entityId ? updated : e)));
  }

  function removeEntity(entityId) {
    setEntities((prev) => prev.filter((e) => e.id !== entityId));
    setRelationships((prev) => prev.filter((r) => r.from !== entityId && r.to !== entityId));
  }

  function addEntity() {
    setEntities((prev) => [...prev, createEmptyEntity(prev.length)]);
  }

  function updateEntityPosition(entityId, position) {
    setEntities((prev) => prev.map((e) => (e.id === entityId ? { ...e, position } : e)));
  }

  function addRelationship() {
    if (entities.length < 2) {
      alert("Necesitás al menos 2 entidades para crear una relación.");
      return;
    }
    setRelationships((prev) => [...prev, createEmptyRelationship(entities)]);
  }

  function updateRelationship(relId, updated) {
    setRelationships((prev) => prev.map((r) => (r.id === relId ? updated : r)));
  }

  function removeRelationship(relId) {
    setRelationships((prev) => prev.filter((r) => r.id !== relId));
  }

  function handleDownload() {
    const blob = new Blob([JSON.stringify(diagramJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName || "diagrama"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleGenerateBackend() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const response = await fetch(GENERATOR_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(diagramJson),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `El servidor respondió ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName || "backend"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setGenerateError(
        err.message === "Failed to fetch"
          ? "No se pudo conectar con el generador. ¿Está corriendo 'npm start' en la carpeta generator?"
          : err.message
      );
    } finally {
      setGenerating(false);
    }
  }

  function handleReset() {
    if (!confirm("¿Vaciar todo el diagrama?")) return;
    setEntities([]);
    setRelationships([]);
  }

  function handleLoadSample() {
    setProjectName(SAMPLE_DIAGRAM.projectName);
    setBasePackage(SAMPLE_DIAGRAM.basePackage);
    setEntities(SAMPLE_DIAGRAM.entities);
    setRelationships(SAMPLE_DIAGRAM.relationships);
  }

  async function handleAssistantCommand(commandText) {
    setAssistantLoading(true);
    setAssistantError(null);
    setAssistantWarnings([]);

    try {
      const response = await fetch(ASSISTANT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: commandText, diagram: diagramJson }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `El servidor respondió ${response.status}`);
      }

      applyAssistantResult(data);
    } catch (err) {
      handleAssistantError(err);
    } finally {
      setAssistantLoading(false);
    }
  }

  async function handleImportImage(file) {
    setAssistantLoading(true);
    setAssistantError(null);
    setAssistantWarnings([]);

    try {
      const imageBase64 = await fileToBase64(file);
      const response = await fetch(IMPORT_IMAGE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: file.type }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `El servidor respondió ${response.status}`);
      }

      applyAssistantResult(data);
    } catch (err) {
      handleAssistantError(err);
    } finally {
      setAssistantLoading(false);
    }
  }

  // Compartido por el asistente de texto/voz y el de imagen: ambos devuelven
  // el mismo contrato { message, operations }.
  function applyAssistantResult(data) {
    const result = applyOperations(entities, relationships, data.operations || []);
    setEntities(result.entities);
    setRelationships(result.relationships);
    setAssistantMessage(data.message || "Listo.");
    setAssistantWarnings(result.warnings);
  }

  function handleAssistantError(err) {
    setAssistantMessage(null);
    setAssistantError(
      err.message === "Failed to fetch"
        ? "No se pudo conectar con el servidor. ¿Está corriendo 'npm start' en la carpeta generator?"
        : err.message
    );
  }

  function handleExportDrawio() {
    const xml = buildDrawioXml(diagramJson);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName || "diagrama"}.drawio`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportDrawioFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = parseDrawioXml(reader.result);
      applyAssistantResult(result);
    };
    reader.onerror = () => handleAssistantError(new Error("No se pudo leer el archivo."));
    reader.readAsText(file);
  }

    function handleExportEa() {
    const xml = buildEaNativeXml(diagramJson);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName || "diagrama"}-ea.xml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleImportAnyFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const format = detectFormat(text);
      try {
        if (format === "drawio") {
          applyAssistantResult(parseDrawioXml(text));
        } else if (format === "ea-native") {
          const result = parseEaNativeXml(text);
          applyAssistantResult(result);
          // Aplicar posiciones si vinieron
          if (result.positions) {
            setTimeout(() => {
              setEntities((prev) =>
                prev.map((e) =>
                  result.positions[e.name]
                    ? { ...e, position: result.positions[e.name] }
                    : e
                )
              );
            }, 0);
          }
        } else if (format === "ea-xmi") {
          setAssistantError(
            "El archivo es XMI de EA. Exportá desde EA con 'Export Package to Native XML' (no XMI) y volvé a intentar."
          );
        } else if (format === "bpmn") {
          setAssistantError("El archivo es BPMN. Todavía no soportado.");
        } else {
          setAssistantError(
            "No reconocí el formato del archivo. Se aceptan .drawio, .xml de draw.io y XML nativo de EA 17."
          );
        }
      } catch (err) {
        handleAssistantError(err);
      }
    };
    reader.onerror = () => handleAssistantError(new Error("No se pudo leer el archivo."));
    reader.readAsText(file, "windows-1252");
  }

  return (
    <div className="app-shell">
      <header>
        <h1>Editor de Modelo de Datos</h1>
        <CollaboratorsBar collaborators={collaborators} myPresence={myPresence} connected={connected} />
        <ShareProjectButton />
      </header>

      <AssistantBar
        onSubmit={handleAssistantCommand}
        onImportImage={handleImportImage}
        loading={assistantLoading}
        message={assistantMessage}
        warnings={assistantWarnings}
        errorMessage={assistantError}
      />

      <main>
        <div className="panel-form">
          <section className="block">
            <h2>Proyecto</h2>
            <div className="project-meta">
              <div>
                <label htmlFor="projectName">Nombre del proyecto</label>
                <input
                  id="projectName"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="basePackage">Paquete base (Java)</label>
                <input
                  id="basePackage"
                  type="text"
                  value={basePackage}
                  onChange={(e) => setBasePackage(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="block">
            <h2>Entidades</h2>
            {entities.length === 0 && <p className="empty-hint">Todavía no agregaste ninguna entidad.</p>}
            {entities.map((entity) => (
              <EntityCard
                key={entity.id}
                entity={entity}
                onChange={(updated) => updateEntity(entity.id, updated)}
                onRemove={() => removeEntity(entity.id)}
              />
            ))}
            <button className="add-btn" onClick={addEntity}>+ Agregar entidad</button>
          </section>

          <section className="block">
            <h2>Relaciones</h2>
            {relationships.length === 0 && <p className="empty-hint">Todavía no agregaste ninguna relación.</p>}
            {relationships.map((rel) => (
              <RelationshipCard
                key={rel.id}
                relationship={rel}
                entities={entities}
                onChange={(updated) => updateRelationship(rel.id, updated)}
                onRemove={() => removeRelationship(rel.id)}
              />
            ))}
            <button className="add-btn" onClick={addRelationship}>+ Agregar relación</button>
          </section>
        </div>

        <div className={`panel-preview ${previewView === "diagram" ? "panel-preview--diagram" : ""}`}>
          <div className="preview-tabs">
            <button
              className={previewView === "diagram" ? "tab-active" : ""}
              onClick={() => setPreviewView("diagram")}
            >
              Diagrama
            </button>
            <button
              className={previewView === "json" ? "tab-active" : ""}
              onClick={() => setPreviewView("json")}
            >
              JSON
            </button>
          </div>

          {previewView === "diagram" ? (
            <DiagramCanvas
              entities={entities}
              relationships={relationships}
              onEntityPositionChange={updateEntityPosition}
            />
          ) : (
            <pre>{JSON.stringify(diagramJson, null, 2)}</pre>
          )}
        </div>
      </main>

      <div className="toolbar-wrapper">
        <div className="toolbar">
          <button className="primary" onClick={handleGenerateBackend} disabled={generating}>
            {generating ? "Generando..." : "⚙ Generar backend"}
          </button>
          <button onClick={handleDownload}>Descargar diagrama.json</button>
          <button onClick={handleExportDrawio}>📐 Exportar a draw.io</button>
          <button onClick={() => drawioFileInputRef.current?.click()}>📥 Importar draw.io</button>
          <button onClick={handleLoadSample}>Cargar ejemplo (Cliente/Pedido)</button>
          <button onClick={handleReset}>Vaciar</button>
          <button onClick={handleExportEa}>📤 Exportar a EA (.xml)</button>
          <button onClick={() => drawioFileInputRef.current?.click()}>📥 Importar EA/draw.io</button>
          <input
            type="file"
            accept=".xml,.drawio,.xmi"
            ref={drawioFileInputRef}
            onChange={handleImportAnyFile}
            style={{ display: "none" }}
          />
        </div>
        {generateError && <p className="error-hint">{generateError}</p>}
      </div>
    </div>
  );
}