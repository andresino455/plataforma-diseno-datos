/// Un campo de una entidad, tal como lo describe el esquema OpenAPI
/// (components.schemas.<Entidad>.properties.<campo>).
class FieldDefinition {
  final String name;
  final String openApiType; // "string", "integer", "number", "boolean"
  final String? format; // ej. "uuid", "date", "date-time"
  final bool isId;

  FieldDefinition({
    required this.name,
    required this.openApiType,
    this.format,
    this.isId = false,
  });
}

/// Una entidad descubierta dinámicamente. "path" se arma con la MISMA regla
/// que usa el generador de backend (entity.name.toLowerCase() + "s"), así
/// que no hace falta parsear las rutas del OpenAPI: alcanza con mirar el
/// nombre del esquema, porque los dos lados (generador y app) comparten esa
/// convención de nombres.
class EntityDefinition {
  final String name; // ej. "Cliente"
  final String path; // ej. "clientes"
  final List<FieldDefinition> fields;

  EntityDefinition({
    required this.name,
    required this.path,
    required this.fields,
  });

  FieldDefinition? get idField {
    for (final f in fields) {
      if (f.isId) return f;
    }
    return null;
  }

  List<FieldDefinition> get editableFields => fields.where((f) => !f.isId).toList();
}