import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import "../styles/auth.css";

// SQLite guarda las fechas en UTC como "2026-11-04 20:31:00".
function formatDate(sqliteDate) {
  const date = new Date(`${String(sqliteDate).replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

export default function ProjectsPage({ onOpen }) {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([apiFetch("/api/projects"), apiFetch("/api/invitations")]);
      setProjects(p.projects);
      setInvitations(i.invitations);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Ejecuta una acción contra el servidor mostrando el error si falla.
  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    run(async () => {
      const data = await apiFetch("/api/projects", { method: "POST", body: { name: newName } });
      onOpen(data.project.id);
    });
  }

  function handleAccept(invitation) {
    run(async () => {
      const data = await apiFetch(`/api/invitations/${invitation.id}/accept`, { method: "POST" });
      onOpen(data.projectId);
    });
  }

  function handleDecline(invitation) {
    run(async () => {
      await apiFetch(`/api/invitations/${invitation.id}/decline`, { method: "POST" });
      await load();
    });
  }

  function handleRename(project) {
    const name = window.prompt("Nuevo nombre del proyecto:", project.name);
    if (!name || !name.trim() || name.trim() === project.name) return;
    run(async () => {
      await apiFetch(`/api/projects/${project.id}`, { method: "PATCH", body: { name } });
      await load();
    });
  }

  function handleDelete(project) {
    if (!window.confirm(`¿Eliminar "${project.name}" para todos sus miembros? No se puede deshacer.`)) return;
    run(async () => {
      await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
      await load();
    });
  }

  function handleLeave(project) {
    if (!window.confirm(`¿Salir del proyecto "${project.name}"? Vas a necesitar otra invitación para volver.`)) return;
    run(async () => {
      await apiFetch(`/api/projects/${project.id}/members/${user.id}`, { method: "DELETE" });
      await load();
    });
  }

  return (
    <div className="projects-page">
      <header className="projects-header">
        <h1>Mis proyectos</h1>
        <span className="user-chip" title={user.email}>
          {user.name}
        </span>
        <button className="nav-btn" onClick={logout}>
          Cerrar sesión
        </button>
      </header>

      <main className="projects-main">
        {error && <p className="auth-error">{error}</p>}

        {invitations.length > 0 && (
          <section className="projects-section">
            <h2>Invitaciones pendientes</h2>
            {invitations.map((inv) => (
              <div key={inv.id} className="invitation-row">
                <div>
                  <strong>{inv.project_name}</strong>
                  <span className="muted"> — te invitó {inv.invited_by_name}</span>
                </div>
                <div className="row-actions">
                  <button className="primary" disabled={busy} onClick={() => handleAccept(inv)}>
                    Aceptar
                  </button>
                  <button disabled={busy} onClick={() => handleDecline(inv)}>
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="projects-section">
          <h2>Nuevo proyecto</h2>
          <form className="new-project-form" onSubmit={handleCreate}>
            <input
              type="text"
              placeholder="Nombre del proyecto (ej. TiendaOnline)"
              value={newName}
              maxLength={80}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="primary" type="submit" disabled={busy || !newName.trim()}>
              Crear y abrir
            </button>
          </form>
        </section>

        <section className="projects-section">
          <h2>Proyectos</h2>
          {loading && <p className="muted">Cargando...</p>}
          {!loading && projects.length === 0 && (
            <p className="empty-hint">Todavía no tenés proyectos. Creá el primero arriba o aceptá una invitación.</p>
          )}
          <div className="project-grid">
            {projects.map((project) => (
              <article key={project.id} className="project-card">
                <div className="project-card-top">
                  <h3 title={project.name}>{project.name}</h3>
                  <span className={`role-badge role-${project.role}`}>
                    {project.role === "owner" ? "Dueño" : "Colaborador"}
                  </span>
                </div>
                <p className="muted">
                  {project.role === "owner" ? "Creado por vos" : `De ${project.owner_name}`}
                  {" · "}
                  {formatDate(project.updated_at)}
                </p>
                <div className="row-actions">
                  <button className="primary" onClick={() => onOpen(project.id)}>
                    Abrir
                  </button>
                  {project.role === "owner" ? (
                    <>
                      <button disabled={busy} onClick={() => handleRename(project)}>
                        Renombrar
                      </button>
                      <button className="danger-btn" disabled={busy} onClick={() => handleDelete(project)}>
                        Eliminar
                      </button>
                    </>
                  ) : (
                    <button className="danger-btn" disabled={busy} onClick={() => handleLeave(project)}>
                      Salir
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
