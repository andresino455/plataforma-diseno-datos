const { operationsSchemaBlock } = require("./operationsSchema");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Modelo de visión recomendado actualmente por la documentación oficial de
// Groq (console.groq.com/docs/vision). Es un modelo "preview": Groq puede
// cambiarlo o retirarlo con poco aviso — si falla con "model_not_found",
// revisá esa página para ver el reemplazo vigente.
const VISION_MODEL = "qwen/qwen3.6-27b";

function buildVisionSystemPrompt() {
  return `Sos un asistente que interpreta una IMAGEN de un diagrama de datos (entidad-relación o clases UML) y lo traduce a una lista de operaciones estructuradas para reconstruirlo en un editor.

Mirá la imagen con atención: identificá cada entidad/tabla/clase (normalmente un rectángulo con un título y una lista de atributos debajo), el tipo de cada atributo si es legible, y las líneas que conectan entidades (relaciones), incluyendo cardinalidad o roles si están indicados en el dibujo.

${operationsSchemaBlock()}

Si la imagen no parece ser un diagrama de datos (por ejemplo, es una foto de otra cosa, o es un tipo de diagrama sin entidades/tablas, como un diagrama de secuencia o de flujo), devolvé "operations": [] y explicá en "message" qué detectaste en la imagen en su lugar.

Sé conciso en "message" (una sola oración). No repitas información innecesaria en las operaciones.`;
}

async function interpretDiagramImage(imageBase64, mimeType) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta configurar GROQ_API_KEY. Creá un archivo .env en la carpeta 'generator' " +
        "(podés copiar .env.example) con tu API key de https://console.groq.com/keys"
    );
  }

  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0.2,
      // Qwen 3.6 es un modelo "razonador": sin este flag, gasta el
      // presupuesto de tokens "pensando" en un bloque interno antes de
      // escribir el JSON, y con límites de salida chicos (plan gratuito)
      // se corta antes de terminar. "none" lo pone en modo directo.
      reasoning_effort: "none",
      // El plan gratuito de Groq limita este modelo a 1000 tokens de salida
      // por minuto (OTPM). Sin este límite explícito, Groq pide el default
      // (2048) y la API rechaza la request antes de procesarla.
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildVisionSystemPrompt() },
        {
          role: "user",
          content: [
            { type: "text", text: "Reconstruí este diagrama de datos." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error de la API de Groq (visión, ${response.status}): ${errText}`);
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

module.exports = { interpretDiagramImage };