import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import "../styles/chat.css";

// Atajos que le piden a la IA que haga de moderadora o de desarrolladora.
const QUICK_ACTIONS = [
  { label: "📝 Resumir", text: "@IA resumí lo que venimos hablando: acuerdos, decisiones pendientes y quién propuso qué." },
  {
    label: "🧭 Moderar",
    text: "@IA actuá como moderadora: ¿quiénes participaron, qué falta decidir y a quién le pedirías opinión?",
  },
  {
    label: "💡 Proponer",
    text: "@IA proponé una mejora concreta para el modelo actual y, si corresponde, los cambios para aplicar al diagrama.",
  },
];

// Descripción legible de una operación que propone la IA.
function describeOperation(op) {
  switch (op.type) {
    case "ADD_ENTITY":
      return `➕ Entidad «${op.name}»`;
    case "ADD_ATTRIBUTE":
      return `➕ Campo ${op.name}: ${op.dataType || "String"} en ${op.entityName}`;
    case "ADD_RELATIONSHIP":
      return `🔗 Relación ${op.fromEntity} (1) → ${op.toEntity} (N)`;
    case "RENAME_ENTITY":
      return `✏️ Renombrar ${op.oldName} → ${op.newName}`;
    case "REMOVE_ENTITY":
      return `🗑 Eliminar entidad ${op.name}`;
    case "REMOVE_ATTRIBUTE":
      return `🗑 Quitar campo ${op.attributeName} de ${op.entityName}`;
    default:
      return `• ${op.type}`;
  }
}

// Markdown mínimo, sin dangerouslySetInnerHTML: **negrita**, `código` y @IA resaltado.
function renderInline(text, keyPrefix) {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|@IA(?![\wáéíóúñ]))/gi).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={key}>{part.slice(1, -1)}</code>;
    if (/^@IA$/i.test(part)) return <span key={key} className="chat-mention">{part}</span>;
    return part;
  });
}

// Separa los bloques ```código``` del resto del texto.
function renderMessageText(text) {
  const blocks = [];
  const regex = /```[\w+-]*\n?([\s\S]*?)```/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) blocks.push({ kind: "text", value: text.slice(last, match.index) });
    blocks.push({ kind: "code", value: match[1].replace(/\n$/, "") });
    last = regex.lastIndex;
  }
  if (last < text.length) blocks.push({ kind: "text", value: text.slice(last) });

  return blocks.map((block, i) =>
    block.kind === "code" ? (
      <pre key={i} className="chat-code">
        <code>{block.value}</code>
      </pre>
    ) : (
      <p key={i} className="chat-text">
        {block.value
          .trim()
          .split("\n")
          .map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {renderInline(line, `${i}-${j}`)}
            </span>
          ))}
      </p>
    )
  );
}

function formatTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Chat grupal del proyecto. Todos los miembros ven los mismos mensajes; la IA
 * responde cuando la mencionan con @IA y puede proponer cambios al diagrama.
 */
export default function ChatPanel({ chat, myId, connected, onClose }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/ai/status")
      .then((data) => !cancelled && setStatus(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Baja al último mensaje cuando llega algo nuevo.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, chat.aiTyping]);

  function submit(value) {
    const clean = value.trim();
    if (!clean) return;
    if (chat.send(clean)) setText("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(text);
    }
  }

  return (
    <aside className="chat-panel" aria-label="Chat del equipo">
      <div className="chat-header">
        <div>
          <strong>💬 Chat del equipo</strong>
          <span className="chat-status" title={status?.message || ""}>
            {status === null
              ? "Comprobando IA..."
              : status.available
                ? `IA ${status.local ? "local" : "en la nube"}: ${status.model}`
                : `⚠️ ${status.message}`}
          </span>
        </div>
        <button className="ghost" onClick={onClose} aria-label="Cerrar chat">
          ✕
        </button>
      </div>

      <div className="chat-messages" ref={listRef}>
        {chat.messages.length === 0 && (
          <p className="chat-empty">
            Este chat lo ven todos los miembros del proyecto. Escribí <span className="chat-mention">@IA</span> para
            hablarle a la IA: modera la conversación y puede proponer soluciones para el diagrama.
          </p>
        )}

        {chat.messages.map((m) => {
          if (m.role === "system") {
            return (
              <div key={m.id} className="chat-system">
                {m.text}
              </div>
            );
          }

          const mine = m.role === "user" && m.userId === myId;
          const isAi = m.role === "assistant";
          const hasOps = isAi && m.operations?.length > 0;

          return (
            <div key={m.id} className={`chat-msg ${mine ? "chat-msg--mine" : ""} ${isAi ? "chat-msg--ai" : ""}`}>
              <div className="chat-meta">
                <span className="chat-author" style={{ color: isAi ? undefined : m.color }}>
                  {isAi ? "🤖 IA" : mine ? "Vos" : m.name}
                </span>
                <span className="chat-time">{formatTime(m.createdAt)}</span>
              </div>
              <div className="chat-bubble">
                {renderMessageText(m.text)}

                {hasOps && (
                  <div className="chat-ops">
                    <strong>Cambios propuestos al diagrama</strong>
                    <ul>
                      {m.operations.map((op, i) => (
                        <li key={i}>{describeOperation(op)}</li>
                      ))}
                    </ul>
                    {m.appliedBy ? (
                      <span className="chat-applied">✔ Aplicado por {m.appliedBy}</span>
                    ) : (
                      <button className="primary" onClick={() => chat.requestApply(m.id)} disabled={!connected}>
                        Aplicar al diagrama
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {chat.aiTyping && (
          <div className="chat-typing">
            🤖 IA está escribiendo<span className="chat-dots" />
          </div>
        )}
      </div>

      <div className="chat-quick">
        {QUICK_ACTIONS.map((action) => (
          <button key={action.label} disabled={!connected || chat.aiTyping} onClick={() => submit(action.text)}>
            {action.label}
          </button>
        ))}
      </div>

      <div className="chat-input">
        <textarea
          rows={2}
          value={text}
          maxLength={2000}
          placeholder={connected ? "Escribí al equipo… (@IA para hablarle a la IA)" : "Sin conexión con el servidor"}
          disabled={!connected}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="primary" disabled={!connected || !text.trim()} onClick={() => submit(text)}>
          Enviar
        </button>
      </div>
    </aside>
  );
}
