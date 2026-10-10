// Este módulo concentra "la forma" del diagrama: los mismos campos que
// espera el generador de backend (ver /generator/src/generate.js).
// Si el equipo agrega un tipo de dato o un tipo de relación nuevo, se
// declara acá y en el generador.

export const TYPES = ["UUID", "String", "Integer", "Long", "Double", "Boolean", "Date", "DateTime"];

export const RELATIONSHIP_TYPES = ["ONE_TO_MANY"]; // el generador hoy solo soporta este tipo

let counter = 0;
export function uid(prefix) {
  counter += 1;
  return `${prefix}${counter}`;
}

export function createEmptyEntity(index = 0, name = "NuevaEntidad") {
  return {
    id: uid("e"),
    name,
    position: gridPosition(index),
    attributes: [
      { id: uid("a"), name: "id", type: "UUID", isPrimaryKey: true, nullable: false, unique: false },
    ],
  };
}

// Ubica las entidades nuevas en una grilla simple para que no aparezcan
// todas amontonadas en el mismo punto del lienzo.
export function gridPosition(index) {
  const COLS = 3;
  const SPACING_X = 260;
  const SPACING_Y = 220;
  return {
    x: (index % COLS) * SPACING_X,
    y: Math.floor(index / COLS) * SPACING_Y,
  };
}

export function createEmptyAttribute() {
  return { id: uid("a"), name: "campo", type: "String", isPrimaryKey: false, nullable: true, unique: false };
}

export function createEmptyRelationship(entities) {
  return {
    id: uid("r"),
    from: entities[0]?.id ?? "",
    to: entities[1]?.id ?? entities[0]?.id ?? "",
    type: "ONE_TO_MANY",
    fromRole: "items",
    toRole: "padre",
  };
}

export const SAMPLE_DIAGRAM = {
  projectName: "TiendaOnline",
  basePackage: "com.tienda.generado",
  entities: [
    {
      id: "e1", name: "Cliente", position: { x: 0, y: 0 }, attributes: [
        { id: "a1", name: "id", type: "UUID", isPrimaryKey: true, nullable: false, unique: false },
        { id: "a2", name: "nombre", type: "String", isPrimaryKey: false, nullable: false, unique: false },
        { id: "a3", name: "correo", type: "String", isPrimaryKey: false, nullable: false, unique: true },
      ],
    },
    {
      id: "e2", name: "Pedido", position: { x: 320, y: 0 }, attributes: [
        { id: "b1", name: "id", type: "UUID", isPrimaryKey: true, nullable: false, unique: false },
        { id: "b2", name: "fecha", type: "Date", isPrimaryKey: false, nullable: false, unique: false },
        { id: "b3", name: "total", type: "Double", isPrimaryKey: false, nullable: false, unique: false },
      ],
    },
  ],
  relationships: [
    { id: "r1", from: "e1", to: "e2", type: "ONE_TO_MANY", fromRole: "pedidos", toRole: "cliente" },
  ],
};

// Convierte el estado de la UI en el JSON exacto que consume el generador.
export function buildDiagramJson({ projectName, basePackage, entities, relationships }) {  return {
    diagramId: "react-editor-" + Date.now(),
    type: "data-model",
    projectName,
    basePackage,
    entities: entities.map((e) => ({
      id: e.id,
      name: e.name,
      position: e.position,
      attributes: e.attributes.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        ...(a.isPrimaryKey ? { isPrimaryKey: true } : {}),
        ...(a.nullable === false ? { nullable: false } : {}),
        ...(a.unique ? { unique: true } : {}),
      })),
    })),
    relationships: relationships.map((r) => ({
      id: r.id, from: r.from, to: r.to, type: r.type, fromRole: r.fromRole, toRole: r.toRole,
    })),
  };
}

/**
 * Aplica las operaciones que devuelve el asistente de IA sobre el estado
 * actual del editor. Este es el único lugar donde la IA puede afectar el
 * diagrama: recibe una lista de intenciones (agregar, renombrar, borrar) y
 * decide de forma determinística cómo tocan el estado real, generando IDs
 * y posiciones con las mismas funciones que usa el resto del editor.
 *
 * Nunca confía ciegamente en la IA: si una operación referencia una entidad
 * que no existe, o un tipo de dato inválido, se ignora esa operación y se
 * agrega una advertencia legible para el usuario.
 */
export function applyOperations(entities, relationships, operations) {
  let nextEntities = entities.map((e) => ({ ...e, attributes: [...e.attributes] }));
  let nextRelationships = [...relationships];
  const warnings = [];

  function findEntity(name) {
    return nextEntities.find((e) => e.name.toLowerCase() === String(name).toLowerCase());
  }

  for (const op of operations || []) {
    switch (op.type) {
      case "ADD_ENTITY": {
        if (findEntity(op.name)) {
          warnings.push(`La entidad "${op.name}" ya existe, no se creó de nuevo.`);
          break;
        }
        nextEntities.push(createEmptyEntity(nextEntities.length, op.name));
        break;
      }

      case "ADD_ATTRIBUTE": {
        const entity = findEntity(op.entityName);
        if (!entity) {
          warnings.push(`No encontré la entidad "${op.entityName}" para agregarle el campo "${op.name}".`);
          break;
        }
        if (entity.attributes.some((a) => a.name.toLowerCase() === String(op.name).toLowerCase())) {
          warnings.push(`El campo "${op.name}" ya existe en "${entity.name}".`);
          break;
        }
        const type = TYPES.includes(op.dataType) ? op.dataType : "String";
        if (!TYPES.includes(op.dataType)) {
          warnings.push(`Tipo de dato "${op.dataType}" no reconocido, se usó "String" para "${op.name}".`);
        }
        entity.attributes.push({
          id: uid("a"),
          name: op.name,
          type,
          isPrimaryKey: !!op.isPrimaryKey,
          nullable: op.nullable !== false,
          unique: !!op.unique,
        });
        break;
      }

      case "ADD_RELATIONSHIP": {
        const from = findEntity(op.fromEntity);
        const to = findEntity(op.toEntity);
        if (!from || !to) {
          warnings.push(`No pude crear la relación entre "${op.fromEntity}" y "${op.toEntity}" (alguna entidad no existe).`);
          break;
        }
        nextRelationships.push({
          id: uid("r"),
          from: from.id,
          to: to.id,
          type: RELATIONSHIP_TYPES.includes(op.relType) ? op.relType : "ONE_TO_MANY",
          fromRole: op.fromRole || "items",
          toRole: op.toRole || "padre",
        });
        break;
      }

      case "RENAME_ENTITY": {
        const entity = findEntity(op.oldName);
        if (!entity) {
          warnings.push(`No encontré la entidad "${op.oldName}" para renombrar.`);
          break;
        }
        entity.name = op.newName;
        break;
      }

      case "REMOVE_ENTITY": {
        const entity = findEntity(op.name);
        if (!entity) {
          warnings.push(`No encontré la entidad "${op.name}" para eliminar.`);
          break;
        }
        nextEntities = nextEntities.filter((e) => e.id !== entity.id);
        nextRelationships = nextRelationships.filter((r) => r.from !== entity.id && r.to !== entity.id);
        break;
      }

      case "REMOVE_ATTRIBUTE": {
        const entity = findEntity(op.entityName);
        if (!entity) {
          warnings.push(`No encontré la entidad "${op.entityName}".`);
          break;
        }
        entity.attributes = entity.attributes.filter(
          (a) => a.name.toLowerCase() !== String(op.attributeName).toLowerCase()
        );
        break;
      }

      default:
        warnings.push(`Operación no soportada: "${op.type}".`);
    }
  }

  return { entities: nextEntities, relationships: nextRelationships, warnings };
}