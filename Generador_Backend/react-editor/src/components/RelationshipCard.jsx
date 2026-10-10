export default function RelationshipCard({ relationship, entities, onChange, onRemove }) {
  function update(patch) {
    onChange({ ...relationship, ...patch });
  }

  return (
    <div className="rel-card">
      <div>
        <label>Desde</label>
        <select value={relationship.from} onChange={(e) => update({ from: e.target.value })}>
          {entities.map((ent) => (
            <option key={ent.id} value={ent.id}>{ent.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label>Hacia</label>
        <select value={relationship.to} onChange={(e) => update({ to: e.target.value })}>
          {entities.map((ent) => (
            <option key={ent.id} value={ent.id}>{ent.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label>Rol (desde → hacia)</label>
        <input type="text" value={relationship.fromRole} onChange={(e) => update({ fromRole: e.target.value })} />
      </div>
      <div>
        <label>Rol (hacia → desde)</label>
        <input type="text" value={relationship.toRole} onChange={(e) => update({ toRole: e.target.value })} />
      </div>
      <button className="ghost" onClick={onRemove} title="Eliminar relación">✕</button>
    </div>
  );
}
