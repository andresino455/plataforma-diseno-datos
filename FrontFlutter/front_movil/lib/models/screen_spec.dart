import 'widget_spec.dart';

class ScreenSpec {
  final String id; // asignado por la app, nunca por la IA
  final String title;
  final List<WidgetSpec> widgets;

  ScreenSpec({required this.id, required this.title, required this.widgets});

  factory ScreenSpec.fromAiResponse(String id, Map<String, dynamic> json) {
    final widgetsJson = (json['widgets'] as List<dynamic>?) ?? [];
    return ScreenSpec(
      id: id,
      title: json['title'] as String? ?? 'Pantalla',
      widgets: widgetsJson.map((w) => WidgetSpec.fromJson(w as Map<String, dynamic>)).toList(),
    );
  }

  /// Para guardar/leer en almacenamiento local (incluye el id, a diferencia
  /// de fromAiResponse que lo recibe aparte).
  factory ScreenSpec.fromJson(Map<String, dynamic> json) {
    return ScreenSpec(
      id: json['id'] as String,
      title: json['title'] as String? ?? 'Pantalla',
      widgets: ((json['widgets'] as List<dynamic>?) ?? [])
          .map((w) => WidgetSpec.fromJson(w as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'widgets': widgets.map((w) => w.toJson()).toList(),
      };

  ScreenSpec copyWith({String? title, List<WidgetSpec>? widgets}) {
    return ScreenSpec(id: id, title: title ?? this.title, widgets: widgets ?? this.widgets);
  }
}