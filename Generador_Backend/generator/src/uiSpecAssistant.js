// Genera la ESPECIFICACIÓN de una pantalla (no código, un JSON declarativo)
// a partir de una descripción en lenguaje natural. El celular la renderiza
// en vivo con un intérprete genérico (ver dynamic_screen_view.dart) — mismo
// patrón que el resto del proyecto: la IA propone una estructura, el código
// la valida y la ejecuta de forma determinística, nunca al revés.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

function buildSystemPrompt(availableEntities) {
  const entitiesDesc = availableEntities
    .map((e) => `- ${e.name} (campos: ${e.fields.join(", ")})`)
    .join("\n");

  return `Sos un asistente que genera pantallas simples para una app móvil, a partir de una descripción en lenguaje natural del usuario.

Entidades disponibles en el backend conectado:
${entitiesDesc}

Una pantalla se arma con una lista de "widgets" de estos dos tipos únicamente, en el orden en que deben mostrarse:

- { "type": "text", "props": { "content": "texto a mostrar, ej. un mensaje de bienvenida" } }
- { "type": "button", "props": { "label": "texto del botón", "action": "open_list" o "open_form", "entity": "NombreDeEntidad" } }
  - "open_list" navega a la lista de esa entidad.
  - "open_form" abre el formulario para crear un registro nuevo de esa entidad.

Devolvé SIEMPRE y ÚNICAMENTE un objeto JSON, sin texto antes ni después, sin backticks:

{
  "message": "una frase corta confirmando qué pantalla se armó",
  "screenSpec": {
    "title": "título de la pantalla",
    "widgets": [ ... ]
  }
}

Reglas:
- El valor de "entity" en cualquier botón debe ser EXACTAMENTE uno de los nombres de entidad listados arriba, tal cual están escritos.
- No inventes entidades que no estén en la lista de arriba.
- Si la instrucción es ambigua, hacé la interpretación más razonable en vez de devolver una pantalla vacía.
- Nunca agregues texto fuera del JSON.`;
}

async function generateScreen(command, availableEntities) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta configurar GROQ_API_KEY. Creá un archivo .env en la carpeta 'generator' con tu API key de https://console.groq.com/keys"
    );
  }

  const entityNames = availableEntities.map((e) => e.name);

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(availableEntities) },
        { role: "user", content: `Instrucción: "${command}"` },
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

  if (!parsed.screenSpec || !Array.isArray(parsed.screenSpec.widgets)) {
    throw new Error("La respuesta de la IA no tiene el formato esperado (falta 'screenSpec.widgets').");
  }

  // Nunca confiamos ciegamente: cada widget se valida antes de llegar al
  // celular. Un widget de tipo desconocido, o que referencia una entidad
  // que no existe, se descarta en vez de romper el renderizado.
  parsed.screenSpec.widgets = parsed.screenSpec.widgets.filter((w) => {
    if (w.type === "text") return typeof w.props?.content === "string";
    if (w.type === "button") {
      return (
        (w.props?.action === "open_list" || w.props?.action === "open_form") &&
        entityNames.includes(w.props?.entity)
      );
    }
    return false;
  });

  return parsed;
}

module.exports = { generateScreen };