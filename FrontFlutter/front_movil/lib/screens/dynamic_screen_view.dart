import 'package:flutter/material.dart';
import '../models/entity_definition.dart';
import '../models/screen_spec.dart';
import '../services/discovery_service.dart';
import 'entity_list_screen.dart';

/// Renderiza EN VIVO una pantalla a partir de su especificación (ScreenSpec),
/// sin generar ni compilar ningún código — esto es "generar el front" en el
/// sentido de la consigna: la IA arma la estructura, este widget la dibuja.
class DynamicScreenView extends StatelessWidget {
  final ScreenSpec spec;

  const DynamicScreenView({super.key, required this.spec});

  Future<void> _handleButtonTap(BuildContext context, Map<String, dynamic> props) async {
    final entityName = props['entity'] as String?;
    final action = props['action'] as String?;
    if (entityName == null || action == null) return;

    try {
      // Volvemos a descubrir las entidades en vez de guardarlas en caché:
      // así, si el backend cambió (por ejemplo, regeneraste el backend con
      // otro diagrama), el botón sigue funcionando o avisa claramente si esa
      // entidad ya no existe, en vez de mostrar datos viejos.
      final entities = await DiscoveryService().discoverEntities();
      EntityDefinition? entity;
      for (final e in entities) {
        if (e.name == entityName) {
          entity = e;
          break;
        }
      }

      if (entity == null) {
        throw Exception('La entidad "$entityName" ya no existe en el backend conectado.');
      }
      final resolvedEntity = entity; // ya no es nullable: seguro de capturar en el closure de abajo

      if (!context.mounted) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => EntityListScreen(entity: resolvedEntity, autoOpenAddDialog: action == 'open_form'),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo abrir: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(spec.title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: spec.widgets.map((w) {
          switch (w.type) {
            case 'text':
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  w.props['content'] as String? ?? '',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              );
            case 'button':
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: FilledButton(
                  onPressed: () => _handleButtonTap(context, w.props),
                  child: Text(w.props['label'] as String? ?? 'Abrir'),
                ),
              );
            default:
              return const SizedBox.shrink();
          }
        }).toList(),
      ),
    );
  }
}