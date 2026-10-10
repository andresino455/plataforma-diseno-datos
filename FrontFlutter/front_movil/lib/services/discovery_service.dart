import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';
import '../models/entity_definition.dart';

/// Descubre dinámicamente qué entidades expone un backend generado, leyendo
/// su documentación OpenAPI (expuesta por springdoc en /api-docs, ver el
/// application.properties que arma el generador). Así la app no depende de
/// ningún modelo hardcodeado: funciona con CUALQUIER backend que haya salido
/// de la herramienta web, sea el diagrama que sea.
class DiscoveryService {
  Future<List<EntityDefinition>> discoverEntities() async {
    final response = await http.get(Uri.parse('$apiBaseUrl/api-docs'));

    if (response.statusCode != 200) {
      throw Exception('No se pudo leer la documentación OpenAPI (HTTP ${response.statusCode})');
    }

    final Map<String, dynamic> data = jsonDecode(response.body);
    final schemas = (data['components']?['schemas'] as Map<String, dynamic>?) ?? {};

    final entities = <EntityDefinition>[];

    schemas.forEach((schemaName, schemaDefRaw) {
      final schemaDef = schemaDefRaw as Map<String, dynamic>;
      final properties = (schemaDef['properties'] as Map<String, dynamic>?) ?? {};

      final fields = properties.entries
          // Solo campos con un tipo primitivo simple (string/integer/number/
          // boolean). Las relaciones JPA (List<Pedido>, Cliente, etc.) no
          // tienen un "type" primitivo en el esquema —tienen "$ref" o
          // "items"— y esta versión de la app no las edita, para no armar
          // un formulario con objetos anidados. Quedan como trabajo futuro.
          .where((entry) => (entry.value as Map<String, dynamic>).containsKey('type'))
          .map((entry) {
        final propDef = entry.value as Map<String, dynamic>;
        return FieldDefinition(
          name: entry.key,
          openApiType: propDef['type'] as String,
          format: propDef['format'] as String?,
          isId: entry.key.toLowerCase() == 'id',
        );
      }).toList();

      entities.add(EntityDefinition(
        name: schemaName,
        path: '${schemaName.toLowerCase()}s', // misma convención que usa el generador
        fields: fields,
      ));
    });

    return entities;
  }
}