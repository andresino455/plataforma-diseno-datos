import 'package:flutter/material.dart';
import '../models/entity_definition.dart';
import '../models/screen_spec.dart';
import '../models/widget_spec.dart';
import '../services/discovery_service.dart';

class ScreenEditorScreen extends StatefulWidget {
  final ScreenSpec spec;

  const ScreenEditorScreen({super.key, required this.spec});

  @override
  State<ScreenEditorScreen> createState() => _ScreenEditorScreenState();
}

class _ScreenEditorScreenState extends State<ScreenEditorScreen> {
  late final TextEditingController _titleController;
  late List<WidgetSpec> _widgets;
  List<EntityDefinition> _entities = [];
  bool _loadingEntities = true;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.spec.title);
    _widgets = [...widget.spec.widgets];
    _loadEntities();
  }

  Future<void> _loadEntities() async {
    try {
      final entities = await DiscoveryService().discoverEntities();
      if (!mounted) return;
      setState(() {
        _entities = entities;
        _loadingEntities = false;
      });
    } catch (e) {
      // Sin backend disponible ahora mismo igual se puede editar título,
      // texto, y reordenar/borrar — solo no se pueden agregar botones
      // nuevos (necesitan saber qué entidades existen).
      if (!mounted) return;
      setState(() => _loadingEntities = false);
    }
  }

  Future<void> _editTextWidget(int index) async {
    final controller = TextEditingController(text: _widgets[index].props['content'] as String? ?? '');

    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Texto'),
        content: TextField(controller: controller, autofocus: true, maxLines: 3),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text), child: const Text('Guardar')),
        ],
      ),
    );

    if (result == null) return;
    setState(() => _widgets[index] = _widgets[index].copyWith(props: {'content': result}));
  }

  Future<void> _editButtonWidget(int index) async {
    final current = _widgets[index];
    final labelController = TextEditingController(text: current.props['label'] as String? ?? '');
    String selectedEntity = current.props['entity'] as String? ?? (_entities.isNotEmpty ? _entities.first.name : '');
    String selectedAction = current.props['action'] as String? ?? 'open_list';

    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Botón'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: labelController, decoration: const InputDecoration(labelText: 'Texto del botón')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _entities.any((e) => e.name == selectedEntity) ? selectedEntity : null,
                decoration: const InputDecoration(labelText: 'Entidad'),
                items: _entities.map((e) => DropdownMenuItem(value: e.name, child: Text(e.name))).toList(),
                onChanged: (v) => setDialogState(() => selectedEntity = v ?? selectedEntity),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: selectedAction,
                decoration: const InputDecoration(labelText: 'Acción'),
                items: const [
                  DropdownMenuItem(value: 'open_list', child: Text('Ver lista')),
                  DropdownMenuItem(value: 'open_form', child: Text('Agregar nuevo')),
                ],
                onChanged: (v) => setDialogState(() => selectedAction = v ?? selectedAction),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () => Navigator.pop(context, {
                'label': labelController.text,
                'entity': selectedEntity,
                'action': selectedAction,
              }),
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );

    if (result == null) return;
    setState(() => _widgets[index] = _widgets[index].copyWith(props: result));
  }

  void _addTextWidget() {
    setState(() => _widgets.add(WidgetSpec(type: 'text', props: {'content': 'Texto nuevo'})));
    _editTextWidget(_widgets.length - 1);
  }

  void _addButtonWidget() {
    if (_entities.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No hay entidades disponibles (¿está el backend corriendo?).')),
      );
      return;
    }
    setState(() => _widgets.add(WidgetSpec(
          type: 'button',
          props: {'label': 'Nuevo botón', 'action': 'open_list', 'entity': _entities.first.name},
        )));
    _editButtonWidget(_widgets.length - 1);
  }

  void _removeWidget(int index) {
    setState(() => _widgets.removeAt(index));
  }

  void _save() {
    final updated = widget.spec.copyWith(title: _titleController.text.trim(), widgets: _widgets);
    Navigator.pop(context, updated);
  }

  String _summaryOf(WidgetSpec w) {
    if (w.type == 'text') return w.props['content'] as String? ?? '';
    final accion = w.props['action'] == 'open_list' ? 'ver' : 'agregar';
    return '${w.props['label']} → $accion ${w.props['entity']}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Editar pantalla'),
        actions: [IconButton(onPressed: _save, icon: const Icon(Icons.check), tooltip: 'Guardar')],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _titleController,
            decoration: const InputDecoration(labelText: 'Título de la pantalla', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 20),
          const Text('Elementos', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          if (_widgets.isEmpty) const Text('Todavía no hay elementos. Agregá uno abajo.'),
          ..._widgets.asMap().entries.map((entry) {
            final index = entry.key;
            final w = entry.value;
            return Card(
              child: ListTile(
                leading: Icon(w.type == 'text' ? Icons.text_fields : Icons.smart_button),
                title: Text(_summaryOf(w)),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.edit),
                      onPressed: () => w.type == 'text' ? _editTextWidget(index) : _editButtonWidget(index),
                    ),
                    IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _removeWidget(index)),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _addTextWidget,
                  icon: const Icon(Icons.text_fields),
                  label: const Text('Agregar texto'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _loadingEntities ? null : _addButtonWidget,
                  icon: const Icon(Icons.smart_button),
                  label: const Text('Agregar botón'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}