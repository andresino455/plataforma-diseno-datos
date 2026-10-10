import 'generic_api_service.dart';
import 'offline_store.dart';

/// Envuelve GenericApiService para que la app funcione sin conexión:
/// - getAll: si falla la red, devuelve la última copia guardada localmente.
/// - create/delete: si falla la red, aplica el cambio de forma optimista
///   sobre la copia local y encola la operación real para sincronizar
///   después.
///
/// "Sin conexión" acá se detecta simplemente porque la llamada HTTP falla
/// (no depende de ningún paquete de detección de conectividad, para no
/// sumar otra fuente de fragilidad de versiones al proyecto — ya tuvimos
/// suficiente de eso con flutter_gemma).
class OfflineAwareApiService {
  final GenericApiService _api;
  final OfflineStore _store;

  OfflineAwareApiService(this._api, this._store);

  Future<({List<Map<String, dynamic>> items, bool fromCache})> getAll(String entityPath) async {
    try {
      final items = await _api.getAll(entityPath);
      await _store.setCachedItems(entityPath, items);
      return (items: items, fromCache: false);
    } catch (_) {
      final cached = await _store.getCachedItems(entityPath);
      return (items: cached, fromCache: true);
    }
  }

  Future<void> create(String entityPath, Map<String, dynamic> body) async {
    try {
      await _api.create(entityPath, body);
      final items = await _api.getAll(entityPath);
      await _store.setCachedItems(entityPath, items);
    } catch (_) {
      // Sin conexión: guardamos localmente con un id temporal y encolamos
      // la operación real para cuando vuelva internet.
      final tempId = 'local_${DateTime.now().millisecondsSinceEpoch}';
      final cached = await _store.getCachedItems(entityPath);
      cached.add({...body, 'id': tempId, '_pending': true});
      await _store.setCachedItems(entityPath, cached);

      await _store.addOutboxOperation({
        'type': 'CREATE',
        'entityPath': entityPath,
        'tempId': tempId,
        'body': body,
      });
    }
  }

  Future<void> delete(String entityPath, String id) async {
    try {
      await _api.delete(entityPath, id);
      final items = await _api.getAll(entityPath);
      await _store.setCachedItems(entityPath, items);
    } catch (_) {
      final cached = await _store.getCachedItems(entityPath);
      cached.removeWhere((item) => item['id'] == id);
      await _store.setCachedItems(entityPath, cached);

      if (id.startsWith('local_')) {
        // Nunca se sincronizó (se creó y se borró offline): cancelamos la
        // creación pendiente, no hace falta avisarle nada al backend.
        final ops = await _store.getOutbox();
        ops.removeWhere((op) => op['type'] == 'CREATE' && op['tempId'] == id);
        await _store.setOutbox(ops);
      } else {
        await _store.addOutboxOperation({'type': 'DELETE', 'entityPath': entityPath, 'id': id});
      }
    }
  }

  /// Intenta aplicar todas las operaciones pendientes contra el backend
  /// real. Se llama sola periódicamente y también se puede disparar a mano
  /// con el botón "Sincronizar ahora". Devuelve cuántas se sincronizaron.
  Future<int> syncPendingOperations() async {
    final ops = await _store.getOutbox();
    if (ops.isEmpty) return 0;

    final remaining = <Map<String, dynamic>>[];
    int synced = 0;
    final touchedPaths = <String>{};

    for (final op in ops) {
      try {
        if (op['type'] == 'CREATE') {
          await _api.create(op['entityPath'], Map<String, dynamic>.from(op['body']));
        } else if (op['type'] == 'DELETE') {
          await _api.delete(op['entityPath'], op['id']);
        }
        synced++;
        touchedPaths.add(op['entityPath']);
      } catch (_) {
        remaining.add(op); // seguimos sin conexión (o falló ese ítem puntual): se reintenta después
      }
    }

    await _store.setOutbox(remaining);

    // Refrescamos la caché de lo que sí se sincronizó, para reemplazar los
    // ids temporales por los reales que asignó el backend.
    for (final path in touchedPaths) {
      try {
        final items = await _api.getAll(path);
        await _store.setCachedItems(path, items);
      } catch (_) {
        // Se cortó la conexión de nuevo a mitad de camino; se reintenta en
        // el próximo ciclo, no hace falta hacer nada acá.
      }
    }

    return synced;
  }

  Future<int> pendingCount() async => (await _store.getOutbox()).length;
}