import { useState } from "react";

export default function ShareProjectButton() {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Si el navegador bloquea el acceso al portapapeles (poco común,
      // pero pasa en algunos contextos), al menos mostramos el link.
      window.prompt("Copiá este link para invitar a alguien a este proyecto:", window.location.href);
    }
  }

  return (
    <button onClick={handleShare} title="Copiar el link de este proyecto para invitar a alguien">
      {copied ? "✔ Link copiado" : "🔗 Compartir proyecto"}
    </button>
  );
}