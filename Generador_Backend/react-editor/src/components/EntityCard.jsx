import { TYPES, createEmptyAttribute } from "../model/diagram";

export default function EntityCard({ entity, onChange, onRemove }) {
  function updateEntity(patch) {
    onChange({ ...entity, ...patch });
  }

  function updateAttribute(attrId, patch) {
    updateEntity({
      attributes: entity.attributes.map((a) => (a.id === attrId ? { ...a, ...patch } : a)),
    });
  }

  function removeAttribute(attrId) {
    updateEntity({ attributes: entity.attributes.filter((a) => a.id !== attrId) });
  }

  function addAttribute() {
    updateEntity({ attributes: [...entity.attributes, createEmptyAttribute()] });
  }

  return (
    <div className="entity-card">
      <div className="entity-card-header">
        <input
          type="text"
          className="entity-name"
          value={entity.name}
          onChange={(e) => updateEntity({ name: e.target.value })}
        />
        <button className="ghost" onClick={onRemove} title="Eliminar entidad">
          ✕ Eliminar entidad
        </button>
      </div>

      {entity.attributes.map((attr) => (
        <div className="attr-row" key={attr.id}>
          <input
            type="text"
            className="attr-name"
            value={attr.name}
            placeholder="nombre del campo"
            onChange={(e) => updateAttribute(attr.id, { name: e.target.value })}
          />
          <select
            className="attr-type"
            value={attr.type}
            onChange={(e) => updateAttribute(attr.id, { type: e.target.value })}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <span className="checks">
            <input
              type="checkbox"
              checked={attr.isPrimaryKey}
              onChange={(e) => updateAttribute(attr.id, { isPrimaryKey: e.target.checked })}
            /> PK
          </span>
          <span className="checks">
            <input
              type="checkbox"
              checked={attr.nullable}
              onChange={(e) => updateAttribute(attr.id, { nullable: e.target.checked })}
            /> nullable
          </span>
          <span className="checks">
            <input
              type="checkbox"
              checked={attr.unique}
              onChange={(e) => updateAttribute(attr.id, { unique: e.target.checked })}
            /> unique
          </span>
          <button className="ghost" onClick={() => removeAttribute(attr.id)} title="Eliminar campo">✕</button>
        </div>
      ))}

      <button className="add-btn" style={{ marginTop: 6 }} onClick={addAttribute}>
        + Agregar campo
      </button>
    </div>
  );
}
