import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import AuthPage from "./pages/AuthPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectLoader from "./pages/ProjectLoader";
import "./styles/auth.css";

// La URL ?project=<id> indica qué proyecto está abierto; sin eso se ve la lista.
function readProjectIdFromUrl() {
  return new URLSearchParams(window.location.search).get("project");
}

// Decide qué pantalla mostrar: login → lista de proyectos → editor.
function Gate() {
  const { user, loading } = useAuth();
  const [projectId, setProjectId] = useState(readProjectIdFromUrl);

  // Botones "atrás/adelante" del navegador.
  useEffect(() => {
    const onPopState = () => setProjectId(readProjectIdFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openProject = useCallback((id) => {
    const url = id ? `${window.location.pathname}?project=${encodeURIComponent(id)}` : window.location.pathname;
    window.history.pushState(null, "", url);
    setProjectId(id || null);
  }, []);

  if (loading) {
    return (
      <div className="auth-page">
        <p className="auth-subtitle">Cargando...</p>
      </div>
    );
  }

  // Si abrieron un link compartido sin sesión, se muestra el login y, al
  // entrar, la URL sigue apuntando al proyecto.
  if (!user) return <AuthPage />;

  if (projectId) {
    return <ProjectLoader key={projectId} projectId={projectId} onExit={() => openProject(null)} />;
  }

  return <ProjectsPage onOpen={openProject} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
