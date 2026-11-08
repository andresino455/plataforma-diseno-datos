// Este archivo es la "fuente de la verdad" del contrato entre la IA y el
// editor: cualquier módulo de IA (texto, voz transcripta, imagen, y en el
// futuro otros) devuelve operaciones con esta forma exacta. El frontend
// (react-editor/src/model/diagram.js -> applyOperations) es quien las
// interpreta y aplica de forma determinística.

const VALID_TYPES = ["UUID", "String", "Integer", "Long", "Double", "Boolean", "Date", "DateTime"];
const VALID_REL_TYPES = ["ONE_TO_MANY"];

function operationsSchemaBlock() {
  return `Tipos de datos válidos: ${VALID_TYPES.join(", ")}.
Tipos de relación válidos: ${VALID_REL_TYPES.join(", ")}.

Devolvé SIEMPRE y ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto antes ni después, sin backticks:

{
  "message": "una frase corta en español confirmando qué se hizo (o explicando por qué no se pudo)",
  "operations": [
    { "type": "ADD_ENTITY", "name": "NombreEntidad" },
    { "type": "ADD_ATTRIBUTE", "entityName": "NombreEntidad", "name": "campo", "dataType": "String", "isPrimaryKey": false, "nullable": true, "unique": false },
    { "type": "ADD_RELATIONSHIP", "fromEntity": "A", "toEntity": "B", "relType": "ONE_TO_MANY", "fromRole": "items", "toRole": "padre" },
    { "type": "RENAME_ENTITY", "oldName": "A", "newName": "B" },
    { "type": "REMOVE_ENTITY", "name": "A" },
    { "type": "REMOVE_ATTRIBUTE", "entityName": "A", "attributeName": "campo" }
  ]
}

Reglas:
- Si no se especifica el tipo de un campo, asumí "String".
- Cada entidad nueva ya recibe automáticamente un id UUID por defecto; no agregues una operación ADD_ATTRIBUTE para el id salvo que se pida explícitamente distinto.
- No inventes entidades ni campos que no estén presentes en la instrucción o la imagen.
- Nunca agregues texto fuera del JSON. Nunca uses bloques de código (\`\`\`).`;
}

const OPERATION_TYPES = [
  "ADD_ENTITY",
  "ADD_ATTRIBUTE",
  "ADD_RELATIONSHIP",
  "RENAME_ENTITY",
  "REMOVE_ENTITY",
  "REMOVE_ATTRIBUTE",
];

// Mismo contrato de operaciones, pero sin las reglas de formato de salida
// del asistente de una sola instrucción (el chat define su propio formato).
function operationShapesBlock() {
  return `Tipos de datos válidos: ${VALID_TYPES.join(", ")}.
Tipos de relación válidos: ${VALID_REL_TYPES.join(", ")}.

Operaciones disponibles (las entidades se referencian por NOMBRE):
{ "type": "ADD_ENTITY", "name": "NombreEntidad" }
{ "type": "ADD_ATTRIBUTE", "entityName": "NombreEntidad", "name": "campo", "dataType": "String", "isPrimaryKey": false, "nullable": true, "unique": false }
{ "type": "ADD_RELATIONSHIP", "fromEntity": "A", "toEntity": "B", "relType": "ONE_TO_MANY", "fromRole": "items", "toRole": "padre" }
{ "type": "RENAME_ENTITY", "oldName": "A", "newName": "B" }
{ "type": "REMOVE_ENTITY", "name": "A" }
{ "type": "REMOVE_ATTRIBUTE", "entityName": "A", "attributeName": "campo" }

Cada entidad nueva ya recibe automáticamente un id UUID; no agregues ADD_ATTRIBUTE para el id.
Si no sabés el tipo de un campo, usá "String". No inventes entidades ni campos que nadie pidió.`;
}

module.exports = { VALID_TYPES, VALID_REL_TYPES, OPERATION_TYPES, operationsSchemaBlock, operationShapesBlock };