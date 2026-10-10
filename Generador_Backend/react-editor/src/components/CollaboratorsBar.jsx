export default function CollaboratorsBar({ collaborators, myPresence, connected }) {
  return (
    <div className="collaborators-bar" title={connected ? "Colaboración en tiempo real activa" : "Sin conexión al servidor de colaboración"}>
      <span className={`collab-dot-status ${connected ? "online" : "offline"}`} />
      {collaborators.length === 0 ? (
        <span className="collab-empty">Solo vos</span>
      ) : (
        collaborators.map((u) => (
          <span
            key={u.id}
            className="collab-avatar"
            style={{ background: u.color }}
            title={u.id === myPresence?.id ? `${u.name} (vos)` : u.name}
          >
            {u.name.charAt(0)}
          </span>
        ))
      )}
    </div>
  );
}