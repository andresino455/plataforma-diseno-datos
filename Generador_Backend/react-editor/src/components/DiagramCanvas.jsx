import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import EntityNode from "./EntityNode";

const nodeTypes = { entityNode: EntityNode };

export default function DiagramCanvas({ entities, relationships, onEntityPositionChange }) {
  const nodes = useMemo(
    () =>
      entities.map((entity) => ({
        id: entity.id,
        type: "entityNode",
        position: entity.position || { x: 0, y: 0 },
        data: { entity },
      })),
    [entities]
  );

  const edges = useMemo(
    () =>
      relationships.map((rel) => ({
        id: rel.id,
        source: rel.from,
        target: rel.to,
        label: `${rel.fromRole || ""} · ${rel.toRole || ""}`,
        labelBgPadding: [6, 3],
        labelBgStyle: { fill: "#f5f4f0" },
      })),
    [relationships]
  );

  // Solo nos interesa reflejar el arrastre (posición); el resto de los
  // cambios (selección, tamaño) se ignoran porque no forman parte del modelo.
  const handleNodesChange = useCallback(
    (changes) => {
      const updated = applyNodeChanges(changes, nodes);
      for (const node of updated) {
        const original = entities.find((e) => e.id === node.id);
        if (original && (original.position?.x !== node.position.x || original.position?.y !== node.position.y)) {
          onEntityPositionChange(node.id, node.position);
        }
      }
    },
    [nodes, entities, onEntityPositionChange]
  );

  if (entities.length === 0) {
    return <p className="empty-hint" style={{ padding: 24 }}>Agregá al menos una entidad para ver el diagrama.</p>;
  }

  return (
    <div className="diagram-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        fitView
      >
        <Background gap={16} color="#d8d5cc" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}