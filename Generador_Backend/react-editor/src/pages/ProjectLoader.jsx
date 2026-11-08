import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import ProjectEditor from "../ProjectEditor";
import "../styles/auth.css";

// Descarga el proyecto del servidor (y comprueba que el usuario sea miembro)
// antes de montar el editor, así el editor siempre arranca con datos reales.
// (App.jsx lo monta con key={projectId}, por eso arranca en "loading" cada vez.)
export default function ProjectLoader({ projectId, onExit }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    apiFetch(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", project: data.project });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (state.status === "ready") {
    return <ProjectEditor project={state.project} onExit={onExit} />;
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {state.status === "loading" ? (
          <p className="auth-subtitle">Abriendo proyecto...</p>
        ) : (
          <>
            <h1>No se pudo abrir el proyecto</h1>
            <p className="auth-error">{state.message}</p>
            <button className="primary auth-submit" onClick={onExit}>
              Ir a mis proyectos
            </button>
          </>
        )}
      </div>
    </div>
  );
}
