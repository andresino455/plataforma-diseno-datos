import { useEffect, useMemo, useRef, useState } from "react";
import EntityCard from "./components/EntityCard";
import RelationshipCard from "./components/RelationshipCard";
import DiagramCanvas from "./components/DiagramCanvas";
import AssistantBar from "./components/AssistantBar";
import {
  createEmptyEntity,
  createEntityInFreeSpot,
  ensureUniqueIds,
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
import MembersButton from "./components/MembersButton";
import ChatPanel from "./components/ChatPanel";
import { useAuth } from "./auth/AuthContext";
import { API_BASE, authHeaders } from "./api";

const GENERATOR_API_URL = `${API_BASE}/api/generate`;
const ASSISTANT_API_URL = `${API_BASE}/api/assistant/command`;
const IMPORT_IMAGE_API_URL = `${API_BASE}/api/assistant/import-image`;

// Diagrama con el que arranca un proyecto recién creado (todavía sin guardar nada).
function emptyDiagramFor(projectName) {
  return {
    projectName: projectName.replace(/[^a-zA-Z0-9-_]/g, "") || "MiProyecto",
    basePackage: "com.ejemplo.generado",
    entities: [createEmptyEntity(0)],
    relationships: [],
  };
}

// Convierte un archivo de imagen a base64 puro (sin el prefijo "data:...;base64,").
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Editor de un proyecto ya cargado desde el servidor.
 * @param {{ id: string, name: string, role: "owner"|"editor", diagram: object|null }} project
 * @param {() => void} onExit - volver a "Mis proyectos"
 */
export default function ProjectEditor({ project, onExit }) {
  const { user, logout } = useAuth();
  const [initialDiagram] = useState(() => {
    const diagram = project.diagram ?? emptyDiagramFor(project.name);
    // Proyectos guardados antes de arreglar los ids pueden traer ids repetidos.
    return { ...diagram, ...ensureUniqueIds(diagram.entities ?? [], diagram.relationships ?? []) };
  });

  const [projectName, setProjectName] = useState(initialDiagram.projectName ?? "");
  const [basePackage, setBasePackage] = useState(initialDiagram.basePackage ?? "");
  const [entities, setEntities] = useState(initialDiagram.entities ?? []);
  const [relationships, setRelationships] = useState(initialDiagram.relationships ?? []);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [previewView, setPreviewView] = useState("diagram"); // "diagram" | "json"
  const [formCollapsed, setFormCollapsed] = useState(false); // oculta el panel izquierdo
  const [canvasFocus, setCanvasFocus] = useState(false); // lienzo a pantalla completa
  const [chatOpen, setChatOpen] = useState(false); // chat grupal con la IA
  const [seenCount, setSeenCount] = useState(null); // mensajes del chat que ya vio este usuario
  const formHiddenByChat = useRef(false); // el panel izquierdo se ocultó solo al abrir el chat
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState(null);
  const [assistantWarnings, setAssistantWarnings] = useState([]);
  const [assistantError, setAssistantError] = useState(null);
  const drawioFileInputRef = useRef(null);

  const diagramJson = useMemo(
    () => buildDiagramJson({ projectName, basePackage, entities, relationships }),
    [projectName, basePackage, entities, relationships]
  );

  const { collaborators, myPresence, connected, chat } = useCollaboration(
    diagramJson,
    (remoteDiagram) => {
      const fixed = ensureUniqueIds(remoteDiagram.entities ?? [], remoteDiagram.relationships ?? []);
      setProjectName(remoteDiagram.projectName ?? "");
      setBasePackage(remoteDiagram.basePackage ?? "");
      setEntities(fixed.entities);
      setRelationships(fixed.relationships);
    },
    project.id,
    (code) => {
      // El servidor cortó la conexión: sesión vencida (4401) o ya no sos miembro (4403/4404).
      if (code === 4401) {
        logout();
      } else {
        alert(
          code === 4404
            ? "El dueño eliminó este proyecto."
            : "Ya no tenés acceso a este proyecto."
        );
        onExit();
      }
    },
    // El servidor autorizó a este usuario a aplicar los cambios que propuso la IA en el chat.
    (operations) => {
      const result = applyOperations(entities, relationships, operations);
      setEntities(result.entities);
      setRelationships(result.relationships);
      setAssistantMessage("Cambios propuestos por la IA aplicados desde el chat.");
      setAssistantWarnings(result.warnings);
      setAssistantError(null);
    }
  );

  // En pantallas que no son muy anchas, tres columnas (panel + lienzo + chat)
  // quedan apretadas: al abrir el chat se oculta el panel de entidades y al
  // cerrarlo vuelve. Si la persona lo oculta o lo muestra a mano, se respeta.
  function toggleChat() {
    if (!chatOpen) {
      if (!formCollapsed && window.innerWidth < 1700) {
        setFormCollapsed(true);
        formHiddenByChat.current = true;
      }
      setChatOpen(true);
    } else {
      if (formHiddenByChat.current) setFormCollapsed(false);
      formHiddenByChat.current = false;
      setChatOpen(false);
    }
  }

  function toggleFormPanel() {
    formHiddenByChat.current = false;
    setFormCollapsed((v) => !v);
  }

  // Contador de mensajes sin leer mientras el chat está cerrado.
  useEffect(() => {
    if (chatOpen || (chat.loaded && seenCount === null)) setSeenCount(chat.messages.length);
  }, [chatOpen, chat.loaded, chat.messages.length, seenCount]);
  const unreadChat = seenCount === null ? 0 : Math.max(0, chat.messages.length - seenCount);

  function updateEntity(entityId, updated) {
    setEntities((prev) => prev.map((e) => (e.id === entityId ? updated : e)));
  }

  function removeEntity(entityId) {
    setEntities((prev) => prev.filter((e) => e.id !== entityId));
    setRelationships((prev) => prev.filter((r) => r.from !== entityId && r.to !== entityId));
  }

  function addEntity() {
    setEntities((prev) => [...prev, createEntityInFreeSpot(prev)]);
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
        headers: authHeaders({ "Content-Type": "application/json" }),
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
        headers: authHeaders({ "Content-Type": "application/json" }),
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
        headers: authHeaders({ "Content-Type": "application/json" }),
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
    <div className={`app-shell ${canvasFocus ? "app-shell--focus" : ""}`}>
      <header>
        <button className="nav-btn" onClick={onExit} title="Volver a la lista de proyectos">
          ← Mis proyectos
        </button>
        <h1 title={project.name}>{project.name}</h1>
        <CollaboratorsBar collaborators={collaborators} myPresence={myPresence} connected={connected} />
        <MembersButton project={project} onLeft={onExit} />
        <span className="user-chip" title={user.email}>
          {user.name}
        </span>
        <button className="nav-btn" onClick={logout}>
          Cerrar sesión
        </button>
      </header>

      <AssistantBar
        onSubmit={handleAssistantCommand}
        onImportImage={handleImportImage}
        loading={assistantLoading}
        message={assistantMessage}
        warnings={assistantWarnings}
        errorMessage={assistantError}
      />

      <main
        className={[formCollapsed || canvasFocus ? "main--collapsed" : "", chatOpen ? "main--chat" : ""]
          .filter(Boolean)
          .join(" ")}
      >
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

            <button
              className="tab-tool"
              onClick={toggleFormPanel}
              disabled={canvasFocus}
              title="Mostrar u ocultar el panel de entidades y relaciones"
            >
              {formCollapsed ? "▶ Mostrar panel" : "◀ Ocultar panel"}
            </button>
            <button
              onClick={() => setCanvasFocus((v) => !v)}
              title="Lienzo a pantalla completa (oculta cabecera, asistente y barra inferior)"
            >
              {canvasFocus ? "🗗 Salir de pantalla completa" : "⛶ Pantalla completa"}
            </button>
            <button
              className={chatOpen ? "tab-active" : ""}
              onClick={toggleChat}
              title="Chat del equipo con la IA como moderadora y desarrolladora"
            >
              💬 Chat
              {!chatOpen && unreadChat > 0 && <span className="chat-badge">{unreadChat}</span>}
            </button>
          </div>

          {previewView === "diagram" ? (
            <DiagramCanvas
              key={`${formCollapsed}-${canvasFocus}-${chatOpen}`} // remonta para reajustar el zoom al cambiar el tamaño
              entities={entities}
              relationships={relationships}
              onEntityPositionChange={updateEntityPosition}
            />
          ) : (
            <pre>{JSON.stringify(diagramJson, null, 2)}</pre>
          )}
        </div>

        {chatOpen && (
          <ChatPanel chat={chat} myId={myPresence?.id} connected={connected} onClose={toggleChat} />
        )}
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