import { useEffect, useRef, useState } from "react";
import { WS_BASE, getToken } from "../api";

const COLLAB_WS_BASE_URL = WS_BASE;
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
 * @param {(code: number) => void} onAccessLost - se llama si el servidor corta la
 *   conexión por un motivo de acceso: 4401 sesión inválida/vencida, 4403 ya no
 *   sos miembro del proyecto, 4404 el proyecto fue eliminado.
 *
 * La misma conexión transporta el chat grupal con la IA: devuelve la lista de
 * mensajes, si la IA está "escribiendo", y funciones para escribir y para
 * pedir que se apliquen los cambios que propuso la IA.
 *
 * @param {(operations: object[]) => void} onApplyOperations - el servidor autorizó
 *   a ESTE cliente a aplicar las operaciones de un mensaje de la IA (solo uno de
 *   los miembros lo recibe, así no se aplican dos veces).
 *
 * El servidor exige estar logueado y ser miembro del proyecto: el token de
 * sesión viaja en la URL del WebSocket (el navegador no permite mandar
 * headers personalizados en un WebSocket).
 */
export function useCollaboration(diagramJson, onRemoteDiagram, projectId, onAccessLost, onApplyOperations) {
  const wsRef = useRef(null);
  const suppressNextBroadcastRef = useRef(false);
  const onRemoteDiagramRef = useRef(onRemoteDiagram);
  onRemoteDiagramRef.current = onRemoteDiagram; // siempre la versión más nueva, sin re-conectar el WS
  const onAccessLostRef = useRef(onAccessLost);
  onAccessLostRef.current = onAccessLost;
  const onApplyOperationsRef = useRef(onApplyOperations);
  onApplyOperationsRef.current = onApplyOperations;

  const [collaborators, setCollaborators] = useState([]);
  const [myPresence, setMyPresence] = useState(null);
  const [connected, setConnected] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);

  // Conectar una sola vez por projectId.
  useEffect(() => {
    if (!projectId) return undefined;

    const token = getToken();
    const ws = new WebSocket(
      `${COLLAB_WS_BASE_URL}?projectId=${encodeURIComponent(projectId)}&token=${encodeURIComponent(token ?? "")}`
    );
    wsRef.current = ws;

    // Ignora eventos de una conexión vieja (pasa en desarrollo, donde React
    // monta los efectos dos veces) para que no pisen el estado de la nueva.
    const isCurrent = () => wsRef.current === ws;

    ws.onopen = () => isCurrent() && setConnected(true);
    ws.onclose = (event) => {
      if (!isCurrent()) return;
      setConnected(false);
      setAiTyping(false);
      if (event.code === 4401 || event.code === 4403 || event.code === 4404) {
        onAccessLostRef.current?.(event.code);
      }
    };
    ws.onerror = () => isCurrent() && setConnected(false);

    ws.onmessage = (event) => {
      if (!isCurrent()) return;
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
      } else if (msg.type === "chat_history") {
        setChatMessages(msg.messages);
        setChatLoaded(true);
      } else if (msg.type === "chat_message") {
        setChatMessages((prev) => (prev.some((m) => m.id === msg.message.id) ? prev : [...prev, msg.message]));
      } else if (msg.type === "chat_message_update") {
        setChatMessages((prev) => prev.map((m) => (m.id === msg.message.id ? msg.message : m)));
      } else if (msg.type === "ai_typing") {
        setAiTyping(Boolean(msg.typing));
      } else if (msg.type === "chat_apply_granted") {
        onApplyOperationsRef.current?.(msg.operations);
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

  function sendChatMessage(text) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ type: "chat_message", text }));
    return true;
  }

  function requestApply(messageId) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "chat_apply_request", messageId }));
  }

  const chat = {
    messages: chatMessages,
    loaded: chatLoaded,
    aiTyping,
    send: sendChatMessage,
    requestApply,
  };

  return { collaborators, myPresence, connected, chat };
}