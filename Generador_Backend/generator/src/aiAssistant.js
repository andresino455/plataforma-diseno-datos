const { operationsSchemaBlock } = require("./operationsSchema");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Revisá el modelo vigente en https://console.groq.com/docs/models — los
// modelos de Groq cambian de nombre/disponibilidad con frecuencia.
// (llama-3.3-70b-versatile pasó a ser Enterprise-only; gpt-oss-120b es la
// opción de calidad equivalente disponible en el plan developer/gratuito).
const MODEL = "openai/gpt-oss-120b";

function buildSystemPrompt() {
  return `Sos un asistente que traduce instrucciones en lenguaje natural (español) sobre un diagrama de datos (entidades, atributos y relaciones) a una lista de operaciones estructuradas.

Recibís el diagrama actual (nombres de entidades, sus atributos, y las relaciones) y una instrucción del usuario.

${operationsSchemaBlock()}

Si la instrucción no se puede traducir a estas operaciones (es ambigua, o no tiene que ver con el diagrama), devolvé "operations": [] y explicá brevemente por qué en "message".`;
}

/**
 * Reduce el diagrama completo (con ids internos) a algo liviano y legible
 * por nombre, que es como el usuario y la IA piensan el modelo. Las
 * operaciones que devuelve la IA referencian entidades por NOMBRE, nunca
 * por id — el id lo administra el frontend (ver applyOperations en
 * react-editor/src/model/diagram.js).
 */
function summarizeDiagram(diagram) {
  const entities = (diagram?.entities || []).map((e) => ({
    name: e.name,
    attributes: (e.attributes || []).map((a) => ({
      name: a.name,
      type: a.type,
      isPrimaryKey: !!a.isPrimaryKey,
    })),
  }));

  const relationships = (diagram?.relationships || []).map((r) => {
    const fromEntity = (diagram.entities || []).find((e) => e.id === r.from);
    const toEntity = (diagram.entities || []).find((e) => e.id === r.to);
    return {
      from: fromEntity?.name ?? r.from,
      to: toEntity?.name ?? r.to,
      type: r.type,
      fromRole: r.fromRole,
      toRole: r.toRole,
    };
  });

  return { entities, relationships };
}

async function interpretCommand(command, diagramSummary) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta configurar GROQ_API_KEY. Creá un archivo .env en la carpeta 'generator' " +
        "(podés copiar .env.example) con tu API key de https://console.groq.com/keys"
    );
  }

  const userMessage =
    `Diagrama actual:\n${JSON.stringify(diagramSummary, null, 2)}\n\n` +
    `Instrucción del usuario: "${command}"`;

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" }, // fuerza a Groq a devolver JSON válido
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error de la API de Groq (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error("Groq no devolvió contenido en la respuesta.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error("No se pudo interpretar la respuesta de la IA como JSON: " + raw.slice(0, 200));
  }

  if (!Array.isArray(parsed.operations)) {
    throw new Error("La respuesta de la IA no tiene el formato esperado (falta 'operations').");
  }

  return parsed;
}

module.exports = { interpretCommand, summarizeDiagram };