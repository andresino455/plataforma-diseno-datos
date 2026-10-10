import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/entity_definition.dart';

/// Habla con el servidor Node del generador. Necesita su propio túnel:
/// "adb reverse tcp:4000 tcp:4000", además del que ya usás para el backend
/// generado (puerto 8080).
const String _assistantBaseUrl = 'http://localhost:4000';
//const String _assistantBaseUrl = 'http://192.168.0.8:4000';

class ScreenGeneratorService {
  Future<({String message, Map<String, dynamic> screenSpecJson})> generateScreen({
    required String command,
    required List<EntityDefinition> availableEntities,
  }) async {
    final response = await http.post(
      Uri.parse('$_assistantBaseUrl/api/assistant/generate-screen'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'command': command,
        'availableEntities': availableEntities
            .map((e) => {
                  'name': e.name,
                  'fields': e.fields.map((f) => f.name).toList(),
                })
            .toList(),
      }),
    );

    final data = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode != 200) {
      throw Exception(data['error'] ?? 'El servidor respondió ${response.statusCode}');
    }

    return (
      message: data['message'] as String? ?? 'Listo.',
      screenSpecJson: data['screenSpec'] as Map<String, dynamic>,
    );
  }
}