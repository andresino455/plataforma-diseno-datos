class ScreenConfig {
  final String title;
  final List<String> visibleFields;
  final String? sortField;
  final String sortDirection; // "asc" | "desc"

  ScreenConfig({
    required this.title,
    required this.visibleFields,
    this.sortField,
    this.sortDirection = 'asc',
  });

  factory ScreenConfig.fromJson(Map<String, dynamic> json) {
    return ScreenConfig(
      title: json['title'] as String? ?? '',
      visibleFields: (json['visibleFields'] as List<dynamic>? ?? []).cast<String>(),
      sortField: json['sortField'] as String?,
      sortDirection: json['sortDirection'] as String? ?? 'asc',
    );
  }

  /// La configuración "por defecto" antes de que el usuario pida algo con IA:
  /// muestra todos los campos, sin ordenar, con el nombre de la entidad como título.
  factory ScreenConfig.defaultFor(String entityName, List<String> allFields) {
    return ScreenConfig(title: entityName, visibleFields: allFields);
  }
}