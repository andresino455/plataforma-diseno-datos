import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';

/// CRUD genérico: en vez de una clase Dart por entidad (Cliente, Pedido...),
/// trabaja con Map<String, dynamic>, que es lo que cualquier backend generado
/// devuelve/acepta como JSON. Esto es lo que permite que la misma pantalla
/// sirva para cualquier entidad de cualquier backend generado.
class GenericApiService {
  Future<List<Map<String, dynamic>>> getAll(String path) async {
    final response = await http.get(Uri.parse('$apiBaseUrl/api/$path'));

    if (response.statusCode != 200) {
      throw Exception('Error al obtener "$path" (HTTP ${response.statusCode})');
    }

    final List<dynamic> data = jsonDecode(response.body);
    return data.cast<Map<String, dynamic>>();
  }

  Future<void> create(String path, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse('$apiBaseUrl/api/$path'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );

    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception('Error al crear (HTTP ${response.statusCode}): ${response.body}');
    }
  }

  Future<void> delete(String path, String id) async {
    final response = await http.delete(Uri.parse('$apiBaseUrl/api/$path/$id'));

    if (response.statusCode != 200 && response.statusCode != 204) {
      throw Exception('Error al eliminar (HTTP ${response.statusCode})');
    }
  }
}