import 'dart:convert';
import '../models/entity_definition.dart';
import 'local_ai_service.dart';

/// Versión 100% local de lo que hace generator/src/uiSpecAssistant.js en el
/// servidor Node — mismo prompt, misma validación estricta (nunca confiar
/// ciegamente en lo que devuelve el modelo). La diferencia es que esto corre
/// en el celular, sin red, usando el LocalAiService que se le pase.
class LocalScreenGenerator {
  final LocalAiService aiService;

  LocalScreenGenerator(this.aiService);

  String _buildSystemPrompt(List<EntityDefinition> entities) {
    final entitiesDesc = entities
        .map((e) => '- ${e.name} (campos: ${e.fields.map((f) => f.name).join(", ")})')
        .join('\n');

    return '''Sos un asistente que genera pantallas simples para una app móvil, a partir de una descripción en lenguaje natural del usuario.

Entidades disponibles en el backend conectado:
$entitiesDesc

Una pantalla se arma con una lista de "widgets" de estos dos tipos únicamente, en el orden en que deben mostrarse:

- { "type": "text", "props": { "content": "texto a mostrar" } }
- { "type": "button", "props": { "label": "texto del botón", "action": "open_list" o "open_form", "entity": "NombreDeEntidad" } }

Devolvé SIEMPRE y ÚNICAMENTE un objeto JSON, sin texto antes ni después, sin backticks:

{
  "message": "una frase corta confirmando qué pantalla se armó",
  "screenSpec": {
    "title": "título de la pantalla",
    "widgets": [ ... ]
  }
}

Reglas:
- El valor de "entity" en cualquier botón debe ser EXACTAMENTE uno de los nombres de entidad listados arriba.
- No inventes entidades que no estén en la lista de arriba.
- Nunca agregues texto fuera del JSON.''';
  }

  Future<({String message, Map<String, dynamic> screenSpecJson})> generateScreen({
    required String command,
    required List<EntityDefinition> availableEntities,
  }) async {
    final raw = await aiService.generate(
      systemPrompt: _buildSystemPrompt(availableEntities),
      userPrompt: 'Instrucción: "$command"',
    );

    // Los modelos chicos suelen envolver el JSON en un bloque ```json,
    // aunque se les pida explícitamente que no lo hagan.
    final cleaned = raw
        .trim()
        .replaceAll(RegExp(r'^```json', multiLine: true), '')
        .replaceAll(RegExp(r'```$', multiLine: true), '')
        .trim();

    Map<String, dynamic> parsed;
    try {
      parsed = jsonDecode(cleaned) as Map<String, dynamic>;
    } catch (e) {
      throw Exception('El modelo local no devolvió un JSON válido: ${cleaned.substring(0, cleaned.length.clamp(0, 200))}');
    }

    final screenSpec = parsed['screenSpec'] as Map<String, dynamic>?;
    if (screenSpec == null || screenSpec['widgets'] is! List) {
      throw Exception('La respuesta del modelo local no tiene el formato esperado (falta "screenSpec.widgets").');
    }

    // Misma validación estricta que el lado Node: nunca confiar ciegamente
    // en lo que devuelve el modelo, sea local o en la nube.
    final entityNames = availableEntities.map((e) => e.name).toSet();
    final widgets = (screenSpec['widgets'] as List).where((w) {
      if (w is! Map) return false;
      final props = w['props'];
      if (w['type'] == 'text') {
        return props is Map && props['content'] is String;
      }
      if (w['type'] == 'button') {
        if (props is! Map) return false;
        final action = props['action'];
        final entity = props['entity'];
        return (action == 'open_list' || action == 'open_form') && entityNames.contains(entity);
      }
      return false;
    }).toList();

    screenSpec['widgets'] = widgets;

    return (
      message: parsed['message'] as String? ?? 'Listo.',
      screenSpecJson: screenSpec,
    );
  }
}