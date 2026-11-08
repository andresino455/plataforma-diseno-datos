// Capa de acceso al modelo de lenguaje del chat. Por defecto usa un modelo
// LOCAL con Ollama (https://ollama.com): nada sale de la computadora y no
// hace falta ninguna API key. Opcionalmente puede usar Groq (en la nube).
//
// Variables de entorno (todas opcionales, ver .env.example):
//   LLM_PROVIDER     "ollama" (por defecto) o "groq"
//   OLLAMA_URL       http://localhost:11434
//   OLLAMA_MODEL     qwen2.5:7b
//   OLLAMA_NUM_CTX   8192   (tamaño de contexto; más grande = más RAM)
//   LLM_TIMEOUT_MS   180000 (los modelos locales pueden tardar)
//   GROQ_API_KEY / GROQ_MODEL (solo si LLM_PROVIDER=groq)

// Si no se indica LLM_PROVIDER: con GROQ_API_KEY en el .env se usa Groq (nube);
// sin clave, el modelo local con Ollama.
const provider = () =>
  (process.env.LLM_PROVIDER || (process.env.GROQ_API_KEY ? "groq" : "ollama")).toLowerCase();
const ollamaUrl = () => (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
const ollamaModel = () => process.env.OLLAMA_MODEL || "qwen2.5:7b";
const groqModel = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const numCtx = () => Number(process.env.OLLAMA_NUM_CTX) || 8192;
const timeoutMs = () => Number(process.env.LLM_TIMEOUT_MS) || 180000;

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function modelName() {
  return provider() === "groq" ? groqModel() : ollamaModel();
}

async function chatOllama(messages, schema) {
  const model = ollamaModel();
  let response;
  try {
    response = await fetchWithTimeout(
      `${ollamaUrl()}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          format: schema || "json", // obliga al modelo a devolver JSON válido
          options: { temperature: 0.3, num_ctx: numCtx() },
        }),
      },
      timeoutMs()
    );
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("El modelo local tardó demasiado en responder. Probá con un modelo más chico (OLLAMA_MODEL).");
    }
    throw new Error(
      `No se pudo conectar con Ollama en ${ollamaUrl()}. ¿Está instalado y abierto? (descargalo en https://ollama.com)`
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 404) {
      throw new Error(`Falta descargar el modelo. Ejecutá en una terminal: ollama pull ${model}`);
    }
    throw new Error(`Error de Ollama (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.message?.content;
  if (!content) throw new Error("Ollama no devolvió contenido.");
  return content;
}

async function chatGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Falta GROQ_API_KEY en el archivo .env (LLM_PROVIDER=groq).");

  let response;
  try {
    response = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: groqModel(),
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages,
        }),
      },
      timeoutMs()
    );
  } catch {
    throw new Error("No se pudo conectar con Groq. Revisá tu conexión a internet.");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Error de la API de Groq (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq no devolvió contenido.");
  return content;
}

/**
 * Envía la conversación al modelo y devuelve el texto (que debe ser JSON).
 * @param {{role: string, content: string}[]} messages
 * @param {object} [schema] JSON schema de la respuesta (Ollama lo usa para forzar el formato)
 */
function chatJson(messages, schema) {
  return provider() === "groq" ? chatGroq(messages) : chatOllama(messages, schema);
}

// Para que la interfaz pueda avisar si falta instalar/abrir el modelo.
async function getStatus() {
  const base = { provider: provider(), model: modelName(), local: provider() !== "groq" };

  if (provider() === "groq") {
    return process.env.GROQ_API_KEY
      ? { ...base, available: true }
      : { ...base, available: false, message: "Falta GROQ_API_KEY en el archivo .env." };
  }

  try {
    const response = await fetchWithTimeout(`${ollamaUrl()}/api/tags`, {}, 3000);
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const installed = (data.models || []).map((m) => m.name);
    const wanted = ollamaModel();
    const found = installed.some((name) => name === wanted || name === `${wanted}:latest`);
    return found
      ? { ...base, available: true }
      : { ...base, available: false, message: `Ollama está activo pero falta el modelo. Ejecutá: ollama pull ${wanted}` };
  } catch {
    return {
      ...base,
      available: false,
      message: "Ollama no responde. Instalalo desde https://ollama.com y abrilo.",
    };
  }
}

module.exports = { chatJson, getStatus };
