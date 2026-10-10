import { useEffect, useRef, useState } from "react";

const COLLAB_WS_BASE_URL = "ws://localhost:4000";
const BROADCAST_DEBOUNCE_MS = 400;

/**
 * Encapsula toda la colaboración en tiempo real: conecta el WebSocket a la
 * sala del proyecto indicado, manda el diagrama local cuando cambia (con
 * un pequeño debounce), aplica los cambios que llegan de otros usuarios de
 * esa misma sala, y expone quién está conectado.
 *
 * Estrategia "última edición gana": cuando llega un diagrama remoto,
 * reemplaza el estado local entero (no intenta mezclar campo por campo).
 * Es una simplificación deliberada — ver el comentario en
 * generator/src/collaboration.js para más detalle.
 *
 * @param {object} diagramJson - el diagrama actual (buildDiagramJson(...)).
 * @param {(diagram: object) => void} onRemoteDiagram - se llama cuando llega
 *   un diagrama de otro usuario de la MISMA sala; acá es donde App.jsx debe
 *   actualizar su estado (setEntities, setRelationships, etc.).
 * @param {string} projectId - identifica la sala; dos pestañas con el mismo
 *   projectId colaboran entre sí, con distinto projectId están aisladas.
 */
export function useCollaboration(diagramJson, onRemoteDiagram, projectId) {
  const wsRef = useRef(null);
  const suppressNextBroadcastRef = useRef(false);
  const onRemoteDiagramRef = useRef(onRemoteDiagram);
  onRemoteDiagramRef.current = onRemoteDiagram; // siempre la versión más nueva, sin re-conectar el WS

  const [collaborators, setCollaborators] = useState([]);
  const [myPresence, setMyPresence] = useState(null);
  const [connected, setConnected] = useState(false);

  // Conectar una sola vez por projectId.
  useEffect(() => {
    if (!projectId) return undefined;

    const ws = new WebSocket(`${COLLAB_WS_BASE_URL}?projectId=${encodeURIComponent(projectId)}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "welcome") {
        setMyPresence({ id: msg.id, name: msg.name, color: msg.color });
      } else if (msg.type === "presence") {
        setCollaborators(msg.users);
      } else if (msg.type === "diagram_update") {
        suppressNextBroadcastRef.current = true;
        onRemoteDiagramRef.current(msg.diagram);
      }
    };

    return () => ws.close();
  }, [projectId]);

  // Difundir el diagrama local cuando cambia, salvo que el cambio haya sido
  // producto de aplicar una actualización remota (evita el eco infinito).
  useEffect(() => {
    if (suppressNextBroadcastRef.current) {
      suppressNextBroadcastRef.current = false;
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const timeout = setTimeout(() => {
      ws.send(JSON.stringify({ type: "diagram_update", diagram: diagramJson }));
    }, BROADCAST_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [diagramJson]);

  return { collaborators, myPresence, connected };
}