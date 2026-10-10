import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Guarda en el celular una copia de los datos de cada entidad (para poder
/// listarlos sin conexión) y una cola de operaciones pendientes de
/// sincronizar (creadas/eliminadas mientras no había internet).
class OfflineStore {
  static String _cacheKey(String entityPath) => 'cache_$entityPath';
  static const _outboxKey = 'outbox_operations_v1';

  Future<List<Map<String, dynamic>>> getCachedItems(String entityPath) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_cacheKey(entityPath));
    if (raw == null) return [];
    return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
  }

  Future<void> setCachedItems(String entityPath, List<Map<String, dynamic>> items) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_cacheKey(entityPath), jsonEncode(items));
  }

  Future<List<Map<String, dynamic>>> getOutbox() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_outboxKey);
    if (raw == null) return [];
    return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
  }

  Future<void> setOutbox(List<Map<String, dynamic>> operations) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_outboxKey, jsonEncode(operations));
  }

  Future<void> addOutboxOperation(Map<String, dynamic> operation) async {
    final ops = await getOutbox();
    ops.add(operation);
    await setOutbox(ops);
  }
}