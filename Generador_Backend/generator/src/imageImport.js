const { operationsSchemaBlock } = require("./operationsSchema");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Modelo de visión recomendado actualmente por la documentación oficial de
// Groq (console.groq.com/docs/vision). Es un modelo "preview": Groq puede
// cambiarlo o retirarlo con poco aviso — si falla con "model_not_found",
// revisá esa página para ver el reemplazo vigente.
const VISION_MODEL = "qwen/qwen3.8-27b";

function buildVisionSystemPrompt() {
  return `Sos un experto en ingeniería de datos y reconocimiento visual de diagramas entidad-relación y UML.

Tu tarea es reconstruir el diagrama de la imagen mediante operaciones JSON compatibles con el editor.

${operationsSchemaBlock()}

RECONOCIMIENTO DE ENTIDADES:
1. Identificá todos los rectángulos que representen entidades, tablas o clases.
2. Extraé sus nombres y atributos.
3. Identificá las claves primarias y los tipos de datos cuando sean legibles.
4. No dupliques entidades ni atributos existentes en el diagrama actual.

RECONOCIMIENTO OBLIGATORIO DE RELACIONES:
1. Inspeccioná cuidadosamente TODAS las líneas que conectan entidades.
2. Identificá qué entidad está conectada con cuál.
3. Observá los símbolos de cardinalidad en ambos extremos de cada línea.
4. Si una relación representa uno a muchos (1:N), generá obligatoriamente una operación ADD_RELATIONSHIP.
5. No omitas una relación simplemente porque las entidades tengan atributos con nombres de claves foráneas.
6. Si una entidad contiene una clave foránea que referencia claramente la clave primaria de otra entidad, considerala evidencia de una relación uno a muchos, siempre que no contradiga la imagen.
7. No confundas atributos con relaciones: una clave foránea no reemplaza la operación ADD_RELATIONSHIP.
8. No generes relaciones duplicadas si ya existen en el diagrama actual.
9. Si la cardinalidad es muchos a muchos o uno a uno, no generes una relación porque el editor actualmente solo admite ONE_TO_MANY.
10. No inventes relaciones sin evidencia visual o estructural suficiente.

FORMATO DE LAS RELACIONES:
Usá exclusivamente esta estructura:
{
  "type": "ADD_RELATIONSHIP",
  "fromEntity": "EntidadDelLadoUno",
  "toEntity": "EntidadDelLadoMuchos",
  "relType": "ONE_TO_MANY",
  "fromRole": "coleccion",
  "toRole": "entidadPadre"
}

La entidad del lado UNO debe ser fromEntity.
La entidad del lado MUCHOS debe ser toEntity.
Los roles deben describir correctamente la participación de cada entidad.

COMPROBACIÓN FINAL:
Antes de responder:
- Comprobá que cada entidad conectada tenga su correspondiente relación cuando sea compatible.
- Comprobá que los nombres de las entidades de cada relación coincidan exactamente con los nombres creados o existentes.
- Comprobá que las relaciones no estén duplicadas.
- Comprobá que todas las operaciones respeten el esquema definido.

Si la imagen no contiene relaciones, devolvé únicamente las operaciones que realmente correspondan.

Sé preciso. No sacrifiques las relaciones para priorizar la extracción de atributos.
El campo message debe contener una sola oración breve en español.
Devolvé exclusivamente JSON válido, sin Markdown ni texto adicional.`;
}

async function interpretDiagramImage(
  imageBase64,
  mimeType,
  currentDiagram = null,
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta configurar GROQ_API_KEY. Creá un archivo .env en la carpeta 'generator' " +
        "(podés copiar .env.example) con tu API key de https://console.groq.com/keys",
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
      // Qwen 3.8 es un modelo multimodal con capacidad de visión.
      // reasoning_effort: "none" desactiva el razonamiento extendido
      // para priorizar respuestas directas y reducir el consumo de tokens.
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
            {
              type: "text",
              text:
                "Analizá esta imagen como una referencia para el diagrama del proyecto. " +
                "Identificá sus entidades, atributos y relaciones y generá las operaciones necesarias. " +
                "Compará los elementos detectados con el diagrama actual para evitar duplicar entidades, " +
                "atributos o relaciones que ya existen. No elimines elementos existentes salvo que " +
                "la imagen y la instrucción del usuario indiquen claramente que deben eliminarse.\n\n" +
                "Diagrama actual:\n" +
                JSON.stringify(
                  currentDiagram || { entities: [], relationships: [] },
                  null,
                  2,
                ),
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Error de la API de Groq (visión, ${response.status}): ${errText}`,
    );
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
    throw new Error(
      "No se pudo interpretar la respuesta de la IA como JSON: " +
        raw.slice(0, 200),
    );
  }

  if (!Array.isArray(parsed.operations)) {
    throw new Error(
      "La respuesta de la IA no tiene el formato esperado (falta 'operations').",
    );
  }

  return parsed;
}

module.exports = { interpretDiagramImage };
