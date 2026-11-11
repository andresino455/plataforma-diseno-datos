const WebSocket = require("ws");
const { parse } = require("url");
const db = require("./db");
const { verifyToken } = require("./auth");
const { colorForUser } = require("./colors");
const chat = require("./chat");

// Decisión de diseño (documentada para el informe): esto sincroniza
// difundiendo el DIAGRAMA COMPLETO a todos los clientes conectados a la
// misma "sala" (proyecto) cada vez que alguien lo edita ("last write
// wins"), no un CRDT con resolución fina de conflictos (como Yjs). Es una
// simplificación deliberada dado el tiempo del proyecto.
//
// Con cuentas de usuario, entrar a una sala exige:
//   1. un token de sesión válido (el que devuelve /api/auth/login), y
//   2. ser miembro del proyecto (dueño o invitado que aceptó).
// El diagrama ahora se guarda en la base de datos (tabla projects), así que
// sobrevive a reinicios del servidor.
//
// Por esta misma conexión viaja también el chat grupal con la IA (ver chat.js).

const SAVE_THROTTLE_MS = 1000;
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

// Códigos de cierre propios (4000-4999 están reservados para aplicaciones).
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const CLOSE_NOT_FOUND = 4404;

function isValidDiagram(diagram) {
  return (
    diagram &&
    typeof diagram === "object" &&
    Array.isArray(diagram.entities) &&
    Array.isArray(diagram.relationships)
  );
}

function setupCollaboration(server) {
  const wss = new WebSocket.Server({ server, maxPayload: MAX_PAYLOAD_BYTES });

  const selectDiagram = db.prepare("SELECT diagram FROM projects WHERE id = ?");
  const updateDiagram = db.prepare(
    "UPDATE projects SET diagram = ?, updated_at = datetime('now') WHERE id = ?",
  );
  const selectUser = db.prepare("SELECT id, name FROM users WHERE id = ?");
  const selectMember = db.prepare(
    "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?",
  );

  // Un "room" por proyecto con gente conectada: los clientes y la última
  // versión conocida del diagrama. Se descarta cuando se va el último.
  const rooms = new Map(); // projectId -> { projectId, clients, lastDiagram, dirty, saveTimer }

  function getRoom(projectId) {
    let room = rooms.get(projectId);
    if (!room) {
      let lastDiagram = null;
      const row = selectDiagram.get(projectId);
      if (row?.diagram) {
        try {
          lastDiagram = JSON.parse(row.diagram);
        } catch {
          lastDiagram = null;
        }
      }
      room = {
        projectId,
        clients: new Map(),
        lastDiagram,
        dirty: false,
        saveTimer: null,
        aiRunning: false,
        aiWanted: false,
        // Envía un mensaje a todos los conectados a esta sala.
        broadcast(payload) {
          const data = JSON.stringify(payload);
          for (const clientWs of this.clients.keys()) {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
          }
        },
      };
      rooms.set(projectId, room);
    }
    return room;
  }

  function flushRoom(room) {
    if (room.saveTimer) {
      clearTimeout(room.saveTimer);
      room.saveTimer = null;
    }
    if (!room.dirty || !room.lastDiagram) return;
    room.dirty = false;
    try {
      updateDiagram.run(JSON.stringify(room.lastDiagram), room.projectId);
    } catch (err) {
      room.dirty = true;
      console.error("No se pudo guardar el diagrama:", err.message);
    }
  }

  // Guarda como mucho una vez por segundo mientras alguien edita sin parar.
  function scheduleSave(room) {
    room.dirty = true;
    if (room.saveTimer) return;
    room.saveTimer = setTimeout(() => {
      room.saveTimer = null;
      flushRoom(room);
    }, SAVE_THROTTLE_MS);
  }

  function broadcastPresence(room) {
    // Si el mismo usuario tiene dos pestañas abiertas, se muestra una sola vez.
    const unique = new Map();
    for (const c of room.clients.values())
      unique.set(c.id, { id: c.id, name: c.name, color: c.color });
    const message = JSON.stringify({
      type: "presence",
      users: [...unique.values()],
    });
    for (const ws of room.clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(message);
    }
  }

  // Latido: cada 30 s se le hace "ping" a cada cliente; si no contestó el
  // anterior, la conexión está muerta y se cierra. Además evita que los
  // proxies (Render) corten conexiones que parecen inactivas.
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 30000);
  heartbeat.unref();
  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws, req) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    ws.on("error", () => {});

    const { query } = parse(req.url, true);

    const payload = verifyToken(query.token);
    const user = payload && selectUser.get(payload.sub);
    if (!user) return ws.close(CLOSE_UNAUTHORIZED, "Sesión inválida o vencida");

    const projectId = String(query.projectId || "");
    if (!selectMember.get(projectId, user.id)) {
      return ws.close(CLOSE_FORBIDDEN, "No tenés acceso a este proyecto");
    }

    const room = getRoom(projectId);
    const info = { id: user.id, name: user.name, color: colorForUser(user.id) };
    room.clients.set(ws, info);

    ws.send(JSON.stringify({ type: "welcome", ...info, projectId }));

    // Si ya hay un diagrama conocido para este proyecto, se lo mandamos al
    // que se acaba de unir para que arranque viendo lo mismo que los demás.
    if (room.lastDiagram) {
      ws.send(
        JSON.stringify({
          type: "diagram_update",
          diagram: room.lastDiagram,
          fromId: null,
        }),
      );
    }

    // El chat: historial guardado y, si la IA está respondiendo, el aviso "escribiendo".
    ws.send(
      JSON.stringify({
        type: "chat_history",
        messages: chat.loadHistory(projectId),
      }),
    );
    if (room.aiRunning)
      ws.send(JSON.stringify({ type: "ai_typing", typing: true }));

    broadcastPresence(room);

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === "chat_message") {
        chat.handleUserMessage(room, info, msg.text);
      } else if (msg.type === "chat_apply_request") {
        chat.requestApply(room, ws, info, msg.messageId);
      } else if (msg.type === "diagram_update" && isValidDiagram(msg.diagram)) {
        room.lastDiagram = msg.diagram;
        scheduleSave(room);

        const out = JSON.stringify({
          type: "diagram_update",
          diagram: msg.diagram,
          fromId: info.id,
        });
        for (const clientWs of room.clients.keys()) {
          if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN)
            clientWs.send(out);
        }
      } else if (msg.type === "chat_attachment") {
        chat.handleAttachmentMessage(
          room,
          info,
          msg.attachment,
          msg.text || "",
        );
      }
    });

    ws.on("close", () => {
      room.clients.delete(ws);

      if (room.clients.size === 0) {
        flushRoom(room);
        rooms.delete(projectId);
      } else {
        broadcastPresence(room);
      }
    });
  });

  // Corta las conexiones de un usuario a un proyecto (lo sacaron del proyecto).
  function kickUser(projectId, userId) {
    const room = rooms.get(projectId);
    if (!room) return;
    for (const [ws, info] of room.clients) {
      if (info.id === userId)
        ws.close(CLOSE_FORBIDDEN, "Ya no tenés acceso a este proyecto");
    }
  }

  // Cierra la sala completa (se eliminó el proyecto).
  function closeRoom(projectId) {
    const room = rooms.get(projectId);
    if (!room) return;
    room.dirty = false;
    if (room.saveTimer) clearTimeout(room.saveTimer);
    rooms.delete(projectId);
    for (const ws of room.clients.keys())
      ws.close(CLOSE_NOT_FOUND, "El proyecto fue eliminado");
  }

  // Guarda todo lo pendiente (se usa al apagar el servidor con Ctrl+C).
  function flushAll() {
    for (const room of rooms.values()) flushRoom(room);
  }

  return { wss, kickUser, closeRoom, flushAll };
}

module.exports = { setupCollaboration };
