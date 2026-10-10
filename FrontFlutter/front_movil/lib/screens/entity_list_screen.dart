import 'dart:async';
import 'package:flutter/material.dart';
import '../models/entity_definition.dart';
import '../models/screen_config.dart';
import '../services/generic_api_service.dart';
import '../services/mobile_screen_ai_service.dart';
import '../services/offline_aware_api_service.dart';
import '../services/offline_store.dart';

class EntityListScreen extends StatefulWidget {
  final EntityDefinition entity;
  final bool autoOpenAddDialog;

  const EntityListScreen({super.key, required this.entity, this.autoOpenAddDialog = false});

  @override
  State<EntityListScreen> createState() => _EntityListScreenState();
}

class _EntityListScreenState extends State<EntityListScreen> {
  final OfflineAwareApiService _api = OfflineAwareApiService(GenericApiService(), OfflineStore());
  final MobileScreenAiService _aiService = MobileScreenAiService();

  late Future<({List<Map<String, dynamic>> items, bool fromCache})> _futureItems;
  late ScreenConfig _screenConfig;
  bool _aiLoading = false;
  int _pendingCount = 0;
  Timer? _syncTimer;

  @override
  void initState() {
    super.initState();
    _screenConfig = ScreenConfig.defaultFor(
      widget.entity.name,
      widget.entity.editableFields.map((f) => f.name).toList(),
    );
    _futureItems = _api.getAll(widget.entity.path);
    _refreshPendingCount();

    // Reintenta sincronizar cada 15 segundos si hay algo pendiente. No
    // depende de ningún paquete de detección de conectividad: si no hay
    // internet, el intento simplemente falla y no pasa nada, se prueba de
    // nuevo en el próximo ciclo.
    _syncTimer = Timer.periodic(const Duration(seconds: 15), (_) => _trySync());

    if (widget.autoOpenAddDialog) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _showAddDialog());
    }
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    super.dispose();
  }

  Future<void> _refreshPendingCount() async {
    final count = await _api.pendingCount();
    if (!mounted) return;
    setState(() => _pendingCount = count);
  }

  Future<void> _trySync({bool manual = false}) async {
    final synced = await _api.syncPendingOperations();
    await _refreshPendingCount();
    if (synced > 0) {
      _reload();
      if (mounted) _showError('✔ Se sincronizaron $synced cambio(s) pendiente(s).');
    } else if (manual) {
      _showError(_pendingCount == 0 ? 'No había nada pendiente por sincronizar.' : 'Todavía sin conexión, se reintenta solo.');
    }
  }

  void _reload() {
    setState(() {
      _futureItems = _api.getAll(widget.entity.path);
    });
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  /// Convierte el texto ingresado por el usuario al tipo JSON correcto según
  /// el esquema OpenAPI del campo (Jackson en el backend rechaza, por
  /// ejemplo, un número mandado como string).
  dynamic _coerceValue(FieldDefinition field, String rawText) {
    switch (field.openApiType) {
      case 'integer':
        return int.tryParse(rawText) ?? 0;
      case 'number':
        return double.tryParse(rawText) ?? 0.0;
      case 'boolean':
        return rawText.toLowerCase() == 'true';
      default:
        return rawText;
    }
  }

  Future<void> _showAddDialog() async {
    final controllers = {for (final f in widget.entity.editableFields) f.name: TextEditingController()};

    final confirmado = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Nuevo ${widget.entity.name}'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: widget.entity.editableFields.map((field) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: TextField(
                  controller: controllers[field.name],
                  decoration: InputDecoration(
                    labelText: field.name,
                    helperText: field.openApiType,
                  ),
                  keyboardType: field.openApiType == 'integer' || field.openApiType == 'number'
                      ? TextInputType.number
                      : TextInputType.text,
                ),
              );
            }).toList(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Guardar')),
        ],
      ),
    );

    if (confirmado != true) return;

    final body = <String, dynamic>{};
    for (final field in widget.entity.editableFields) {
      body[field.name] = _coerceValue(field, controllers[field.name]!.text.trim());
    }

    await _api.create(widget.entity.path, body);
    await _refreshPendingCount();
    _reload();
  }

  Future<void> _showAiCustomizeDialog() async {
    final controller = TextEditingController();

    final command = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Personalizar con IA'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Ej: "mostrame solo el nombre y el correo, ordenado por nombre"',
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text.trim()), child: const Text('Aplicar')),
        ],
      ),
    );

    if (command == null || command.isEmpty) return;

    setState(() => _aiLoading = true);
    try {
      final result = await _aiService.customizeScreen(
        entityName: widget.entity.name,
        fields: widget.entity.editableFields.map((f) => f.name).toList(),
        command: command,
      );
      setState(() => _screenConfig = result.config);
      _showError(result.message);
    } catch (e) {
      _showError(
        e.toString().contains('SocketException') || e.toString().contains('Connection')
            ? 'No se pudo conectar con el asistente (esto SÍ necesita internet/el servidor prendido, a diferencia de la lista).'
            : 'No se pudo personalizar: $e',
      );
    } finally {
      setState(() => _aiLoading = false);
    }
  }

  Future<void> _deleteItem(Map<String, dynamic> item) async {
    final idField = widget.entity.idField;
    if (idField == null) return;
    final id = item[idField.name]?.toString();
    if (id == null) return;

    await _api.delete(widget.entity.path, id);
    await _refreshPendingCount();
    _reload();
  }

  /// Arma una línea de texto legible solo con los campos visibles según la
  /// configuración actual (todos por defecto, o el subconjunto que pidió la IA).
  String _summaryOf(Map<String, dynamic> item) {
    return _screenConfig.visibleFields.map((name) => '$name: ${item[name]}').join(' · ');
  }

  List<Map<String, dynamic>> _applySort(List<Map<String, dynamic>> items) {
    final sortField = _screenConfig.sortField;
    if (sortField == null) return items;

    final sorted = [...items];
    sorted.sort((a, b) {
      final valueA = a[sortField];
      final valueB = b[sortField];
      final comparison = Comparable.compare(
        valueA is Comparable ? valueA : valueA.toString(),
        valueB is Comparable ? valueB : valueB.toString(),
      );
      return _screenConfig.sortDirection == 'desc' ? -comparison : comparison;
    });
    return sorted;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_screenConfig.title),
        actions: [
          if (_pendingCount > 0)
            IconButton(
              onPressed: () => _trySync(manual: true),
              icon: Badge(
                label: Text('$_pendingCount'),
                child: const Icon(Icons.sync),
              ),
              tooltip: 'Sincronizar $_pendingCount cambio(s) pendiente(s)',
            ),
          IconButton(
            onPressed: _aiLoading ? null : _showAiCustomizeDialog,
            icon: _aiLoading
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.auto_awesome),
            tooltip: 'Personalizar con IA',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: FutureBuilder<({List<Map<String, dynamic>> items, bool fromCache})>(
          future: _futureItems,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

            if (snapshot.hasError) {
              return ListView(
                children: [
                  const SizedBox(height: 60),
                  Center(child: Text('Error: ${snapshot.error}')),
                ],
              );
            }

            final data = snapshot.data;
            final items = _applySort(data?.items ?? []);
            final fromCache = data?.fromCache ?? false;

            return Column(
              children: [
                if (fromCache)
                  Container(
                    width: double.infinity,
                    color: Colors.orange.withValues(alpha: 0.15),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: const Text(
                      '📴 Sin conexión — mostrando la última copia guardada en el celular.',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                Expanded(
                  child: items.isEmpty
                      ? ListView(
                          children: [
                            const SizedBox(height: 60),
                            Center(
                              child: Text('Todavía no hay ${widget.entity.name.toLowerCase()}s. Tocá + para crear uno.'),
                            ),
                          ],
                        )
                      : ListView.builder(
                          itemCount: items.length,
                          itemBuilder: (context, index) {
                            final item = items[index];
                            final idField = widget.entity.idField;
                            final key = idField != null ? item[idField.name]?.toString() : index.toString();
                            final isPending = item['_pending'] == true;

                            return Dismissible(
                              key: ValueKey(key ?? index),
                              direction: DismissDirection.endToStart,
                              background: Container(
                                color: Colors.red,
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.symmetric(horizontal: 20),
                                child: const Icon(Icons.delete, color: Colors.white),
                              ),
                              onDismissed: (_) => _deleteItem(item),
                              child: ListTile(
                                title: Text(_summaryOf(item)),
                                trailing: isPending
                                    ? const Tooltip(
                                        message: 'Creado sin conexión, todavía no sincronizado',
                                        child: Icon(Icons.cloud_off, size: 18, color: Colors.orange),
                                      )
                                    : null,
                              ),
                            );
                          },
                        ),
                ),
              ],
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddDialog,
        child: const Icon(Icons.add),
      ),
    );
  }
}