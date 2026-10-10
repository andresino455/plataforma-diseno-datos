import { useRef, useState } from "react";

// El reconocimiento de voz del navegador (Web Speech API) solo está
// disponible en Chrome/Edge por ahora. Si no existe, el botón de micrófono
// se deshabilita pero el input de texto sigue funcionando igual.
const SpeechRecognitionImpl =
  typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function AssistantBar({ onSubmit, onImportImage, loading, message, warnings, errorMessage }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  function startListening() {
    if (!SpeechRecognitionImpl) return;
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = "es-ES";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setText(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setText("");
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo después
    if (!file || loading) return;
    onImportImage(file);
  }

  return (
    <div className="assistant-bar">
      <form onSubmit={handleSubmit} className="assistant-form">
        <button
          type="button"
          className={`mic-btn ${listening ? "mic-active" : ""}`}
          onClick={listening ? stopListening : startListening}
          disabled={!SpeechRecognitionImpl}
          title={SpeechRecognitionImpl ? "Hablar" : "Tu navegador no soporta reconocimiento de voz"}
        >
          🎤
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Ej: "agrega una tabla Cliente con nombre y correo"'
        />
        <button type="submit" className="primary" disabled={loading}>
          {loading ? "Pensando..." : "Enviar"}
        </button>
        <button
          type="button"
          className="import-image-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          title="Importar diagrama desde una imagen"
        >
          🖼️ Importar imagen
        </button>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileSelected}
          style={{ display: "none" }}
        />
      </form>

      {message && <p className="assistant-message">🤖 {message}</p>}
      {warnings && warnings.length > 0 && (
        <ul className="assistant-warnings">
          {warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
      {errorMessage && <p className="assistant-error">{errorMessage}</p>}
    </div>
  );
}