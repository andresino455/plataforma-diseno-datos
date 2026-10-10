import 'package:flutter/material.dart';
import '../models/entity_definition.dart';
import '../services/discovery_service.dart';
import 'entity_list_screen.dart';

class EntitiesHomeScreen extends StatefulWidget {
  const EntitiesHomeScreen({super.key});

  @override
  State<EntitiesHomeScreen> createState() => _EntitiesHomeScreenState();
}

class _EntitiesHomeScreenState extends State<EntitiesHomeScreen> {
  final DiscoveryService _discovery = DiscoveryService();
  late Future<List<EntityDefinition>> _futureEntities;

  @override
  void initState() {
    super.initState();
    _futureEntities = _discovery.discoverEntities();
  }

  void _reload() {
    setState(() {
      _futureEntities = _discovery.discoverEntities();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Entidades del backend'),
        actions: [
          IconButton(onPressed: _reload, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: FutureBuilder<List<EntityDefinition>>(
          future: _futureEntities,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

            if (snapshot.hasError) {
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  Icon(Icons.wifi_off, size: 48, color: Colors.grey[400]),
                  const SizedBox(height: 12),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(
                      'No se pudo conectar con el backend.\n\n'
                      '¿Está corriendo, y corriste "adb reverse tcp:8080 tcp:8080"?\n\n'
                      'Detalle: ${snapshot.error}',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              );
            }

            final entities = snapshot.data ?? [];
            if (entities.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 80),
                  Center(child: Text('El backend no expone ninguna entidad todavía.')),
                ],
              );
            }

            return ListView.builder(
              itemCount: entities.length,
              itemBuilder: (context, index) {
                final entity = entities[index];
                return ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.table_chart)),
                  title: Text(entity.name),
                  subtitle: Text('${entity.fields.length} campo(s) · /api/${entity.path}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => EntityListScreen(entity: entity)),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}