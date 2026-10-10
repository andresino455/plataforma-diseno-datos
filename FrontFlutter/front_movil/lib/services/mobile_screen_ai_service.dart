import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/screen_config.dart';

/// Habla con el servidor Node del generador (no con el backend Spring Boot).
/// Necesita su propio túnel: "adb reverse tcp:4000 tcp:4000", además del que
/// ya usás para el backend generado (puerto 8080).
const String _assistantBaseUrl = 'http://localhost:4000';
//const String _assistantBaseUrl = 'http://192.168.0.8:4000';

class MobileScreenAiService {
  Future<({String message, ScreenConfig config})> customizeScreen({
    required String entityName,
    required List<String> fields,
    required String command,
  }) async {
    final response = await http.post(
      Uri.parse('$_assistantBaseUrl/api/assistant/mobile-screen'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'entityName': entityName, 'fields': fields, 'command': command}),
    );

    final data = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode != 200) {
      throw Exception(data['error'] ?? 'El servidor respondió ${response.statusCode}');
    }

    return (
      message: data['message'] as String? ?? 'Listo.',
      config: ScreenConfig.fromJson(data['screenConfig'] as Map<String, dynamic>),
    );
  }
}