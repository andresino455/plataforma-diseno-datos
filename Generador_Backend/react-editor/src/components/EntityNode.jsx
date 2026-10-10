import { Handle, Position } from "@xyflow/react";

// Íconos de texto simples para no depender de una librería de íconos extra.
function attrMarker(attr) {
  if (attr.isPrimaryKey) return "🔑";
  if (attr.unique) return "◆";
  return "";
}

export default function EntityNode({ data }) {
  const { entity } = data;

  return (
    <div className="entity-node">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <div className="entity-node-header">{entity.name || "(sin nombre)"}</div>

      <ul className="entity-node-attrs">
        {entity.attributes.map((attr) => (
          <li key={attr.id}>
            <span className="attr-marker">{attrMarker(attr)}</span>
            <span className="attr-name">{attr.name}</span>
            <span className="attr-type">{attr.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}