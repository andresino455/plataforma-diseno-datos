const db = require("./db");
const { chatJson } = require("./llm");
const { summarizeDiagram } = require("./aiAssistant");
const { OPERATION_TYPES, operationShapesBlock } = require("./operationsSchema");
const { colorForUser } = require("./colors");
const fs = require("fs");
const path = require("path");

const { interpretDiagramImage } = require("./imageImport");
const { interpretCommand } = require("./aiAssistant");
const { transcribeAudio } = require("./audioTranscription");

// Chat grupal del proyecto con una IA que hace de desarrolladora y moderadora.
//
// - Todos los miembros ven el mismo chat (se guarda en la tabla chat_messages
//   y se difunde por el WebSocket de la sala del proyecto).
// - La IA responde cuando alguien la menciona con "@IA".
// - Cada mensaje llega al modelo con el NOMBRE de quien lo escribió, así
//   distingue a los participantes y mantiene el contexto de la conversación.
// - Si la solución implica cambiar el diagrama, la IA adjunta "operations":
//   es una propuesta que cualquier miembro aplica con un botón (la IA nunca
//   modifica el diagrama por su cuenta).

const AI_NAME = "IA";
const MENTION_RE = /(^|[^\w@])@ia(?![\wáéíóúñ])/i;

const MAX_MESSAGE_CHARS = 2000;
const HISTORY_FOR_CLIENT = 100; // mensajes que se muestran al entrar
const HISTORY_FOR_MODEL = 30; // mensajes que se le dan de contexto a la IA
const MODEL_CONTEXT_CHARS = 12000; // tope aproximado del historial enviado
const MAX_OPERATIONS = 40;

const insertMessage = db.prepare(`
  INSERT INTO chat_messages
  (project_id, user_id, role, content, operations, attachment, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const MESSAGE_SELECT = `
  SELECT c.id, c.role, c.user_id, c.content, c.operations,
         c.attachment, c.applied_by, c.created_at,
         u.name AS user_name
  FROM chat_messages c
  LEFT JOIN users u ON u.id = c.user_id`;

const selectById = db.prepare(
  `${MESSAGE_SELECT} WHERE c.id = ? AND c.project_id = ?`,
);
const selectLast = db.prepare(
  `${MESSAGE_SELECT} WHERE c.project_id = ? ORDER BY c.id DESC LIMIT ?`,
);
const markApplied = db.prepare(
  `UPDATE chat_messages SET applied_by = ?
    WHERE id = ? AND project_id = ? AND role = 'assistant' AND operations IS NOT NULL AND applied_by IS NULL`,
);
const selectMembers = db.prepare(
  `SELECT u.id, u.name, m.role
     FROM project_members m JOIN users u ON u.id = m.user_id
    WHERE m.project_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, u.name`,
);
const selectParticipation = db.prepare(
  `SELECT user_id, COUNT(*) AS n FROM (
      SELECT user_id FROM chat_messages WHERE project_id = ? AND role = 'user' ORDER BY id DESC LIMIT 50
   ) GROUP BY user_id`,
);
const selectDiagram = db.prepare("SELECT diagram FROM projects WHERE id = ?");

function getCurrentDiagram(room) {
  if (room.lastDiagram) {
    return room.lastDiagram;
  }

  const stored = selectDiagram.get(room.projectId)?.diagram;

  try {
    return stored
      ? JSON.parse(stored)
      : {
          entities: [],
          relationships: [],
        };
  } catch {
    return {
      entities: [],
      relationships: [],
    };
  }
}

async function processAttachment(room, info, attachment, userText = "") {
  try {
    if (!attachment?.filename) {
      throw new Error("El archivo no tiene un nombre válido.");
    }

    const filename = path.basename(attachment.filename);

    if (filename !== attachment.filename) {
      throw new Error("Nombre de archivo no válido.");
    }

    const uploadDir = path.join(db.DATA_DIR, "chat-uploads");
    const filePath = path.join(uploadDir, filename);

    const buffer = await fs.promises.readFile(filePath);

    if (!buffer.length) {
      throw new Error("El archivo está vacío.");
    }

    const diagram = getCurrentDiagram(room);
    const diagramSummary = summarizeDiagram(diagram);

    let result;
    let aiMessage;

    if (attachment.kind === "image") {
      const imageBase64 = buffer.toString("base64");

      result = await interpretDiagramImage(
        imageBase64,
        attachment.mimeType,
        diagramSummary,
      );

      aiMessage = result.message;
    } else if (attachment.kind === "audio") {
      const transcript = await transcribeAudio(
        buffer,
        attachment.mimeType,
        filename,
      );

      result = await interpretCommand(transcript, diagramSummary);

      aiMessage =
        `🎙️ **Transcripción del audio:**\n${transcript}\n\n` + result.message;
    } else {
      return;
    }

    console.log("\n========== ANÁLISIS DE IMAGEN ==========");

    console.log(
      "OPERACIONES GENERADAS POR LA IA:",
      JSON.stringify(result.operations, null, 2),
    );

    const operations = sanitizeOperations(result.operations);

    console.log(
      "OPERACIONES DESPUÉS DE SANITIZAR:",
      JSON.stringify(operations, null, 2),
    );

    console.log("========================================\n");

    const row = saveAndLoad({
      projectId: room.projectId,
      userId: null,
      role: "assistant",
      content: aiMessage || "He analizado el archivo.",
      operations,
    });

    room.broadcast({
      type: "chat_message",
      message: toClient(row),
    });
  } catch (err) {
    console.error("Error procesando archivo multimedia:", err);

    room.broadcast({
      type: "chat_message",
      message: systemMessage(`⚠️ No pude procesar el archivo: ${err.message}`),
    });
  }
}

function parseOperations(json) {
  if (!json) return [];
  try {
    const ops = JSON.parse(json);
    return Array.isArray(ops) ? ops : [];
  } catch {
    return [];
  }
}

// Forma en que viaja un mensaje hacia el navegador.
function toClient(row) {
  const operations = parseOperations(row.operations);
  return {
    id: row.id,
    role: row.role,
    userId: row.user_id,
    name: row.role === "assistant" ? AI_NAME : row.user_name || "Usuario",
    color: row.user_id ? colorForUser(row.user_id) : null,
    text: row.content,
    operations,
    attachment: row.attachment ? JSON.parse(row.attachment) : null,
    appliedBy: row.applied_by,
    createdAt: row.created_at,
  };
}

// Mensaje de aviso (errores, etc.): se muestra pero no se guarda.
function systemMessage(text) {
  return {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role: "system",
    text,
    operations: [],
    createdAt: new Date().toISOString(),
  };
}

function loadHistory(projectId) {
  return selectLast.all(projectId, HISTORY_FOR_CLIENT).reverse().map(toClient);
}

// ── Prompt ───────────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  return `Sos "${AI_NAME}", la desarrolladora y moderadora de un equipo que diseña en conjunto el modelo de datos de un proyecto (entidades, atributos y relaciones) que después se convierte en un backend Spring Boot. Estás en el CHAT GRUPAL del proyecto: todos los miembros ven todo lo que se escribe, incluidas tus respuestas.

CÓMO LEER EL CHAT
- Cada mensaje humano empieza con "Nombre:", que es quien lo escribió. Respondé a la persona que te habló, llamándola por su nombre, y nunca confundas quién dijo qué. Podés citar a otros ("como propuso Beto...").
- Tus mensajes anteriores también están en la conversación.

COMO MODERADORA
- Buscá que todo el equipo colabore: si alguien casi no participó, invitalo por su nombre a opinar o a encargarse de algo concreto.
- Si hay propuestas distintas, resumilas con neutralidad, compará ventajas y desventajas y pedile al equipo que decida. No tomes partido por una persona.
- Si te piden un resumen, indicá acuerdos, decisiones pendientes y quién propuso qué.
- Sé cordial y breve (hasta unas 6 líneas), salvo que te pidan más detalle.

COMO DESARROLLADORA
- Si te piden una solución, entregala concreta: diseño de entidades y relaciones, código (Java/Spring Boot, SQL), etc. El código va en bloques markdown con \`\`\` dentro de "message".
- Si la solución implica cambiar el diagrama, además completá "operations". Son una PROPUESTA: el equipo la aplica con un botón; vos nunca modificás el diagrama por tu cuenta. Si no hay cambios que proponer, devolvé "operations": [].
- Basate en el diagrama actual que se te da más abajo.

${operationShapesBlock()}

FORMATO DE SALIDA
Devolvé ÚNICAMENTE un objeto JSON con esta forma: {"message": "tu respuesta para el equipo", "operations": [ ... ]}. Dentro de "message" podés usar markdown. Respondé siempre en español.`;
}

function buildContext(projectId, diagram, currentSpeaker) {
  const members = selectMembers.all(projectId);
  const counts = new Map(
    selectParticipation.all(projectId).map((r) => [r.user_id, r.n]),
  );

  const memberLine = members
    .map(
      (m) => `${m.name} (${m.role === "owner" ? "dueño/a" : "colaborador/a"})`,
    )
    .join(", ");
  const participation = members
    .map((m) => `${m.name}: ${counts.get(m.id) || 0}`)
    .join(", ");

  return `CONTEXTO ACTUAL
Miembros del proyecto: ${memberLine}
Mensajes de cada persona en el chat (últimos 50): ${participation}
Quien te escribió por última vez: ${currentSpeaker || "(desconocido)"}

Diagrama actual del proyecto:
${JSON.stringify(summarizeDiagram(diagram || { entities: [], relationships: [] }), null, 1)}`;
}

function buildMessages(room) {
  const rows = selectLast.all(room.projectId, HISTORY_FOR_MODEL).reverse();

  // Recorta lo más viejo si el historial es demasiado largo para el modelo.
  let total = rows.reduce((sum, r) => sum + r.content.length, 0);
  while (rows.length > 2 && total > MODEL_CONTEXT_CHARS) {
    total -= rows.shift().content.length;
  }

  let diagram = room.lastDiagram;
  if (!diagram) {
    const stored = selectDiagram.get(room.projectId)?.diagram;
    try {
      diagram = stored ? JSON.parse(stored) : null;
    } catch {
      diagram = null;
    }
  }

  const lastHuman = [...rows].reverse().find((r) => r.role === "user");

  const history = rows.map((r) =>
    r.role === "assistant"
      ? {
          role: "assistant",
          content: JSON.stringify({
            message: r.content,
            operations: parseOperations(r.operations),
          }),
        }
      : { role: "user", content: `${r.user_name || "Usuario"}: ${r.content}` },
  );

  return [
    {
      role: "system",
      content: `${buildSystemPrompt()}\n\n${buildContext(room.projectId, diagram, lastHuman?.user_name)}`,
    },
    ...history,
  ];
}

// Forma de la respuesta que se le exige al modelo (Ollama la usa para forzar JSON válido).
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
    operations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: OPERATION_TYPES },
          name: { type: "string" },
          entityName: { type: "string" },
          dataType: { type: "string" },
          isPrimaryKey: { type: "boolean" },
          nullable: { type: "boolean" },
          unique: { type: "boolean" },
          fromEntity: { type: "string" },
          toEntity: { type: "string" },
          relType: { type: "string" },
          fromRole: { type: "string" },
          toRole: { type: "string" },
          oldName: { type: "string" },
          newName: { type: "string" },
          attributeName: { type: "string" },
        },
        required: ["type"],
      },
    },
  },
  required: ["message", "operations"],
};

// La IA nunca controla el diagrama: solo se aceptan operaciones conocidas y
// con valores simples. (Además applyOperations en el editor vuelve a validar.)
function sanitizeOperations(list) {
  if (!Array.isArray(list)) return [];
  const clean = [];
  for (const op of list.slice(0, MAX_OPERATIONS)) {
    if (!op || typeof op !== "object" || !OPERATION_TYPES.includes(op.type))
      continue;
    const item = {};
    for (const [key, value] of Object.entries(op)) {
      if (["string", "boolean"].includes(typeof value) && value !== "")
        item[key] = value;
    }
    clean.push(item);
  }
  return clean;
}

function parseAiResponse(raw) {
  let text = String(raw).trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenced) text = fenced[1].trim();

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const braces = text.match(/\{[\s\S]*\}/);
    if (braces) {
      try {
        parsed = JSON.parse(braces[0]);
      } catch {
        parsed = null;
      }
    }
  }

  // El modelo no respetó el formato: mostramos lo que escribió tal cual.
  if (!parsed || typeof parsed !== "object") {
    return {
      message: String(raw).trim().slice(0, 4000) || "(Sin respuesta)",
      operations: [],
    };
  }

  const operations = sanitizeOperations(parsed.operations);
  let message = typeof parsed.message === "string" ? parsed.message.trim() : "";
  if (!message) {
    message = operations.length
      ? "Te dejo una propuesta de cambios para aplicar al diagrama."
      : "(La IA no escribió una respuesta.)";
  }
  return { message, operations };
}

// ── Flujo del chat ───────────────────────────────────────────────────────────

function saveAndLoad({
  projectId,
  userId,
  role,
  content,
  operations,
  attachment,
}) {
  const info = insertMessage.run(
    projectId,
    userId,
    role,
    content || "",
    operations?.length ? JSON.stringify(operations) : null,
    attachment ? JSON.stringify(attachment) : null,
    new Date().toISOString(),
  );

  return selectById.get(info.lastInsertRowid, projectId);
}
async function runAi(room) {
  try {
    const raw = await chatJson(buildMessages(room), RESPONSE_SCHEMA);
    const { message, operations } = parseAiResponse(raw);
    const row = saveAndLoad({
      projectId: room.projectId,
      userId: null,
      role: "assistant",
      content: message,
      operations,
    });
    room.broadcast({ type: "chat_message", message: toClient(row) });
  } catch (err) {
    console.error("Error de la IA en el chat:", err.message);
    room.broadcast({
      type: "chat_message",
      message: systemMessage(`⚠️ ${err.message}`),
    });
  }
}

function handleAttachmentMessage(room, info, attachment, text = "") {
  if (!attachment || !["image", "audio"].includes(attachment.kind)) {
    return;
  }

  const row = saveAndLoad({
    projectId: room.projectId,
    userId: info.id,
    role: "user",
    content: String(text).slice(0, MAX_MESSAGE_CHARS),
    attachment,
  });

  // Primero compartimos el archivo con todos los miembros.
  room.broadcast({
    type: "chat_message",
    message: toClient(row),
  });

  // Después iniciamos el procesamiento de IA sin bloquear el WebSocket.
  processAttachment(room, info, attachment, text);
}

// Una sola respuesta de IA a la vez por proyecto. Si mencionan a la IA mientras
// está respondiendo, se agrupa en una segunda pasada que ya ve todos los mensajes.
async function pumpAi(room) {
  if (room.aiRunning) return;
  room.aiRunning = true;
  room.broadcast({ type: "ai_typing", typing: true });
  try {
    while (room.aiWanted) {
      room.aiWanted = false;
      await runAi(room);
    }
  } finally {
    room.aiRunning = false;
    room.broadcast({ type: "ai_typing", typing: false });
  }
}

/** Un miembro escribió en el chat. */
function handleUserMessage(room, info, rawText) {
  const text = String(rawText ?? "")
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
  if (!text) return;

  const row = saveAndLoad({
    projectId: room.projectId,
    userId: info.id,
    role: "user",
    content: text,
  });
  room.broadcast({ type: "chat_message", message: toClient(row) });

  if (MENTION_RE.test(text)) {
    room.aiWanted = true;
    pumpAi(room);
  }
}

/**
 * Un miembro pidió aplicar los cambios que propuso la IA. El servidor decide
 * quién se los queda (el primero que lo pide) para que no se apliquen dos veces.
 */
function requestApply(room, ws, info, messageId) {
  const id = Number(messageId);
  const row = Number.isInteger(id) ? selectById.get(id, room.projectId) : null;

  if (!row || row.role !== "assistant" || !row.operations) {
    ws.send(
      JSON.stringify({
        type: "chat_message",
        message: systemMessage("Ese mensaje no tiene cambios para aplicar."),
      }),
    );
    return;
  }

  if (markApplied.run(info.name, id, room.projectId).changes === 0) {
    const by = row.applied_by ? `por ${row.applied_by}` : "";
    ws.send(
      JSON.stringify({
        type: "chat_message",
        message: systemMessage(
          `Esos cambios ya fueron aplicados ${by}.`.trim(),
        ),
      }),
    );
    return;
  }

  ws.send(
    JSON.stringify({
      type: "chat_apply_granted",
      messageId: id,
      operations: parseOperations(row.operations),
    }),
  );
  room.broadcast({
    type: "chat_message_update",
    message: toClient(selectById.get(id, room.projectId)),
  });
}

module.exports = {
  loadHistory,
  handleUserMessage,
  handleAttachmentMessage,
  requestApply,
  parseAiResponse,
  MENTION_RE,
};
