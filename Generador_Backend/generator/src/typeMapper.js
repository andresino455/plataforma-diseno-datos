// Traduce los tipos "lógicos" que usa el diagrama (y que la IA de voz también
// va a producir) a tipos Java reales. Si el equipo agrega tipos nuevos al
// editor, solo hay que agregarlos acá.

const TYPE_MAP = {
  UUID: "UUID",
  String: "String",
  Integer: "Integer",
  Long: "Long",
  Double: "Double",
  Boolean: "Boolean",
  Date: "LocalDate",
  DateTime: "LocalDateTime",
};

const IMPORTS_BY_TYPE = {
  UUID: "java.util.UUID",
  LocalDate: "java.time.LocalDate",
  LocalDateTime: "java.time.LocalDateTime",
};

function mapType(diagramType) {
  const javaType = TYPE_MAP[diagramType];
  if (!javaType) {
    throw new Error(
      `Tipo de dato no soportado por el generador: "${diagramType}". ` +
        `Agrégalo a TYPE_MAP en typeMapper.js.`
    );
  }
  return javaType;
}

function importForType(javaType) {
  return IMPORTS_BY_TYPE[javaType] || null;
}

module.exports = { mapType, importForType };
