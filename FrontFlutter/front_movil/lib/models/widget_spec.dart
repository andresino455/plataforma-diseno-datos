class WidgetSpec {
  final String type; // "text" | "button"
  final Map<String, dynamic> props;

  WidgetSpec({required this.type, required this.props});

  factory WidgetSpec.fromJson(Map<String, dynamic> json) {
    return WidgetSpec(
      type: json['type'] as String? ?? '',
      props: Map<String, dynamic>.from(json['props'] as Map? ?? {}),
    );
  }

  Map<String, dynamic> toJson() => {'type': type, 'props': props};

  WidgetSpec copyWith({String? type, Map<String, dynamic>? props}) {
    return WidgetSpec(type: type ?? this.type, props: props ?? this.props);
  }
}