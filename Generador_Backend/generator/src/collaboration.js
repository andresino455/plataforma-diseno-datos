const WebSocket = require("ws");
const { parse } = require("url");

// Decisión de diseño (documentada para el informe): esto sincroniza
// difundiendo el DIAGRAMA COMPLETO a todos los clientes conectados a la
// misma "sala" (proyecto) cada vez que alguien lo edita ("last write
// wins"), no un CRDT con resolución fina de conflictos (como Yjs). Es una
// simplificación deliberada dado el tiempo del proyecto.
//
// "Invitar a colaborar" acá es simplemente: cada proyecto tiene un id único
// en la URL del editor (?project=abc123); quien tenga ese link entra a la
// misma sala. No hay cuentas de usuario ni contraseñas — es el mismo
// modelo que usan herramientas como tldraw o excalidraw para compartir un
// board sin login.

const ADJECTIVES = ["Veloz", "Curioso", "Creativo", "Audaz", "Tranquilo", "Ágil", "Atento"];
const ANIMALS = ["Zorro", "Búho", "Tigre", "Delfín", "Águila", "Panda", "Lince"];
const COLORS = ["#2b7a78", "#b3492f", "#8a6d1a", "#4a5568", "#6c8ebf", "#7a4f9e"];

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function setupCollaboration(server) {
  const wss = new WebSocket.Server({ server });

  // Un "room" por proyecto: quién está conectado + la última versión
  // conocida del diagrama, en memoria (si el servidor se reinicia, se
  // pierde — el respaldo real del usuario sigue siendo "Descargar
  // diagrama.json" en el editor, esto es solo para sincronizar en vivo).
  const rooms = new Map(); // projectId -> { clients: Map<ws, info>, lastDiagram: object|null }

  function getRoom(projectId) {
    if (!rooms.has(projectId)) {
      rooms.set(projectId, { clients: new Map(), lastDiagram: null });
    }
    return rooms.get(projectId);
  }

  function broadcastPresence(room) {
    const users = [...room.clients.values()].map((c) => ({ id: c.id, name: c.name, color: c.color }));
    const message = JSON.stringify({ type: "presence", users });
    for (const ws of room.clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(message);
    }
  }

  wss.on("connection", (ws, req) => {
    const { query } = parse(req.url, true);
    const projectId = query.projectId || "default";
    const room = getRoom(projectId);

    const id = Math.random().toString(36).slice(2, 9);
    const info = { id, name: `${randomFrom(ANIMALS)} ${randomFrom(ADJECTIVES)}`, color: randomFrom(COLORS) };
    room.clients.set(ws, info);

    ws.send(JSON.stringify({ type: "welcome", ...info, projectId }));

    // Si ya hay un diagrama conocido para este proyecto (alguien lo venía
    // editando), se lo mandamos al que se acaba de unir para que arranque
    // viendo lo mismo que los demás, no un diagrama vacío.
    if (room.lastDiagram) {
      ws.send(JSON.stringify({ type: "diagram_update", diagram: room.lastDiagram, fromId: null }));
    }

    broadcastPresence(room);

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === "diagram_update") {
        room.lastDiagram = msg.diagram;
        const payload = JSON.stringify({ type: "diagram_update", diagram: msg.diagram, fromId: id });
        for (const clientWs of room.clients.keys()) {
          if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(payload);
          }
        }
      }
    });

    ws.on("close", () => {
      room.clients.delete(ws);
      broadcastPresence(room);
      // No se borra el room aunque quede vacío: si alguien vuelve a abrir
      // el mismo link más tarde, encuentra el último diagrama guardado.
    });
  });

  return wss;
}

module.exports = { setupCollaboration };