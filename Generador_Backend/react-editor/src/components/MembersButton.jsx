import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";

/**
 * Botón "Miembros" + ventana para ver quién participa en el proyecto e
 * invitar a otros por correo. Solo el dueño invita y quita miembros; los
 * colaboradores ven la lista y pueden salirse del proyecto.
 *
 * @param {{ id: string, name: string, role: "owner"|"editor" }} project
 * @param {() => void} onLeft - se llama cuando el usuario sale del proyecto
 */
export default function MembersButton({ project, onLeft }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOwner = project.role === "owner";

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/projects/${project.id}/members`);
      setMembers(data.members);
      setInvitations(data.invitations);
    } catch (err) {
      setError(err.message);
    }
  }, [project.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  function close() {
    setOpen(false);
    setError(null);
    setNotice(null);
    setEmail("");
  }

  async function run(action) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleInvite(e) {
    e.preventDefault();
    if (!email.trim()) return;
    run(async () => {
      const data = await apiFetch(`/api/projects/${project.id}/invitations`, {
        method: "POST",
        body: { email },
      });
      setEmail("");
      setNotice(
        data.userExists
          ? "Invitación enviada. Le va a aparecer en «Invitaciones pendientes» cuando entre."
          : "Invitación creada. Todavía no tiene cuenta: la va a ver cuando se registre con ese correo."
      );
      await load();
    });
  }

  function handleCancelInvitation(invitation) {
    run(async () => {
      await apiFetch(`/api/projects/${project.id}/invitations/${invitation.id}`, { method: "DELETE" });
      await load();
    });
  }

  function handleRemove(member) {
    if (!window.confirm(`¿Quitar a ${member.name} del proyecto?`)) return;
    run(async () => {
      await apiFetch(`/api/projects/${project.id}/members/${member.id}`, { method: "DELETE" });
      await load();
    });
  }

  function handleLeave() {
    if (!window.confirm("¿Salir de este proyecto? Vas a necesitar otra invitación para volver.")) return;
    run(async () => {
      await apiFetch(`/api/projects/${project.id}/members/${user.id}`, { method: "DELETE" });
      onLeft();
    });
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copiá este link:", window.location.href);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} title="Ver miembros e invitar a otras personas">
        👥 Miembros
      </button>

      {open && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="modal" role="dialog" aria-label="Miembros del proyecto">
            <div className="modal-header">
              <h2>Miembros de «{project.name}»</h2>
              <button className="ghost" onClick={close} aria-label="Cerrar">
                ✕
              </button>
            </div>

            {error && <p className="auth-error">{error}</p>}
            {notice && <p className="auth-notice">{notice}</p>}

            <ul className="member-list">
              {members.map((m) => (
                <li key={m.id}>
                  <span className="member-avatar">{m.name.charAt(0).toUpperCase()}</span>
                  <div className="member-info">
                    <strong>
                      {m.name}
                      {m.id === user.id && " (vos)"}
                    </strong>
                    <span className="muted">{m.email}</span>
                  </div>
                  <span className={`role-badge role-${m.role}`}>{m.role === "owner" ? "Dueño" : "Colaborador"}</span>
                  {isOwner && m.role !== "owner" && (
                    <button className="danger-btn" disabled={busy} onClick={() => handleRemove(m)}>
                      Quitar
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {isOwner && (
              <>
                <h3 className="modal-subtitle">Invitar por correo</h3>
                <form className="new-project-form" onSubmit={handleInvite}>
                  <input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <button className="primary" type="submit" disabled={busy || !email.trim()}>
                    Invitar
                  </button>
                </form>

                {invitations.length > 0 && (
                  <>
                    <h3 className="modal-subtitle">Invitaciones pendientes</h3>
                    <ul className="member-list">
                      {invitations.map((inv) => (
                        <li key={inv.id}>
                          <span className="member-avatar pending">✉</span>
                          <div className="member-info">
                            <strong>{inv.email}</strong>
                            <span className="muted">Esperando que acepte</span>
                          </div>
                          <button disabled={busy} onClick={() => handleCancelInvitation(inv)}>
                            Cancelar
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}

            <div className="modal-footer">
              <button onClick={handleCopyLink}>{copied ? "✔ Link copiado" : "🔗 Copiar link del proyecto"}</button>
              {!isOwner && (
                <button className="danger-btn" disabled={busy} onClick={handleLeave}>
                  Salir del proyecto
                </button>
              )}
            </div>
            <p className="muted modal-hint">
              El link solo abre el proyecto a quienes ya son miembros. Para sumar a alguien, invitalo por correo.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
