
const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

async function transcribeAudio(buffer, mimeType, filename) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("Falta GROQ_API_KEY para transcribir audios.");
  }

  const form = new FormData();

  const blob = new Blob([buffer], { type: mimeType });

  form.append("file", blob, filename || "audio.webm");
  form.append(
    "model",
    process.env.GROQ_AUDIO_MODEL || "whisper-large-v3-turbo"
  );
  form.append("response_format", "json");
  form.append("language", "es");
  form.append(
    "prompt",
    "Audio en español con instrucciones para diseñar diagramas UML y modelos entidad-relación."
  );

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Error transcribiendo audio (${response.status}): ${errorText}`
    );
  }

  const result = await response.json();
  const transcript = String(result.text || "").trim();

  if (!transcript) {
    throw new Error("No se pudo reconocer contenido en el audio.");
  }

  return transcript;
}

module.exports = { transcribeAudio };
