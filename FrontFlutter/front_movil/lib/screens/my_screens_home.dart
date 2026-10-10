import 'package:flutter/material.dart';
import '../models/screen_spec.dart';
import '../services/discovery_service.dart';
import '../services/gemma_local_ai_service.dart';
import '../services/local_screen_generator.dart';
import '../services/screen_generator_service.dart';
import '../services/screen_storage_service.dart';
import '../widgets/voice_text_field.dart';
import 'dynamic_screen_view.dart';
import 'entities_home_screen.dart';
import 'local_ai_test_screen.dart';
import 'screen_editor_screen.dart';

class MyScreensHome extends StatefulWidget {
  const MyScreensHome({super.key});

  @override
  State<MyScreensHome> createState() => _MyScreensHomeState();
}

class _MyScreensHomeState extends State<MyScreensHome> {
  final DiscoveryService _discovery = DiscoveryService();
  final ScreenGeneratorService _cloudGenerator = ScreenGeneratorService();
  final ScreenStorageService _storage = ScreenStorageService();

  // La IA local se crea una sola vez y se reutiliza (recargar el modelo es
  // costoso); se inicializa recién la primera vez que el usuario elige el
  // modo local, no al abrir la app.
  final GemmaLocalAiService _localAiService = GemmaLocalAiService();
  late final LocalScreenGenerator _localGenerator = LocalScreenGenerator(_localAiService);

  List<ScreenSpec> _screens = [];
  int _screenCounter = 0;
  bool _generating = false;
  bool _loadingScreens = true;
  bool _useLocalAi = false;
  double _modelDownloadProgress = 0;

  @override
  void initState() {
    super.initState();
    _loadSavedScreens();
  }

  Future<void> _loadSavedScreens() async {
    final saved = await _storage.loadScreens();
    if (!mounted) return;
    setState(() {
      _screens = saved;
      // Evita que un id nuevo choque con uno ya guardado.
      _screenCounter = saved.length;
      _loadingScreens = false;
    });
  }

  Future<void> _persistScreens() => _storage.saveScreens(_screens);

  @override
  void dispose() {
    _localAiService.dispose();
    super.dispose();
  }

  Future<bool> _ensureLocalModelReady() async {
    if (_localAiService.isReady) return true;

    final shouldDownload = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Preparar IA local'),
        content: const Text(
          'La primera vez hay que descargar el modelo (~2GB, Gemma 2 2B). '
          'Va a quedar guardado en el celular para usos futuros, sin necesitar internet.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Descargar')),
        ],
      ),
    );

    if (shouldDownload != true) return false;

    try {
      await _localAiService.initialize(
        onProgress: (p) => setState(() => _modelDownloadProgress = p),
      );
      return true;
    } catch (e) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo preparar la IA local: $e')));
      return false;
    }
  }

  Future<void> _showGenerateDialog() async {
    final controller = TextEditingController();

    final command = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Generar pantalla con IA'),
        content: VoiceTextField(
          controller: controller,
          hintText: 'Ej: "una pantalla de bienvenida con un botón para ver '
              'clientes y otro para agregar uno nuevo"',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Generar'),
          ),
        ],
      ),
    );

    if (command == null || command.isEmpty) return;

    if (_useLocalAi) {
      final ready = await _ensureLocalModelReady();
      if (!ready) return;
    }

    setState(() => _generating = true);
    try {
      final entities = await _discovery.discoverEntities();

      final result = _useLocalAi
          ? await _localGenerator.generateScreen(command: command, availableEntities: entities)
          : await _cloudGenerator.generateScreen(command: command, availableEntities: entities);

      _screenCounter++;
      final screen = ScreenSpec.fromAiResponse('screen_$_screenCounter', result.screenSpecJson);

      setState(() => _screens.add(screen));
      await _persistScreens();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.message)));

      Navigator.push(context, MaterialPageRoute(builder: (_) => DynamicScreenView(spec: screen)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            !_useLocalAi && (e.toString().contains('SocketException') || e.toString().contains('Connection'))
                ? 'No se pudo conectar. ¿Están corriendo los dos "adb reverse" (8080 y 4000) y el backend + el servidor del generador?'
                : 'No se pudo generar: $e',
          ),
        ),
      );
    } finally {
      setState(() => _generating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis pantallas'),
        actions: [
          IconButton(
            icon: const Icon(Icons.memory),
            tooltip: 'Probar IA local (diagnóstico)',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const LocalAiTestScreen()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.build_circle_outlined),
            tooltip: 'Ver entidades (modo técnico)',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const EntitiesHomeScreen()),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: Row(
              children: [
                Icon(_useLocalAi ? Icons.phone_android : Icons.cloud_outlined, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _useLocalAi ? 'IA local (sin internet, Gemma 2B)' : 'IA en la nube (Groq)',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                Switch(
                  value: _useLocalAi,
                  onChanged: _generating ? null : (v) => setState(() => _useLocalAi = v),
                ),
              ],
            ),
          ),
          if (_generating && _useLocalAi && !_localAiService.isReady)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Column(
                children: [
                  LinearProgressIndicator(value: _modelDownloadProgress),
                  const SizedBox(height: 4),
                  Text('Descargando modelo local... ${(_modelDownloadProgress * 100).toStringAsFixed(0)}%'),
                ],
              ),
            ),
          Expanded(
            child: _loadingScreens
                ? const Center(child: CircularProgressIndicator())
                : _screens.isEmpty
                    ? const Center(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Text(
                            'Todavía no generaste ninguna pantalla.\n\n'
                            'Tocá el botón de abajo y describí qué querés ver, por ejemplo:\n'
                            '"una pantalla de bienvenida con un botón para ver clientes"',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      )
                    : ListView.builder(
                        itemCount: _screens.length,
                        itemBuilder: (context, index) {
                          final screen = _screens[index];
                          return Dismissible(
                            key: ValueKey(screen.id),
                            direction: DismissDirection.endToStart,
                            background: Container(
                              color: Colors.red,
                              alignment: Alignment.centerRight,
                              padding: const EdgeInsets.symmetric(horizontal: 20),
                              child: const Icon(Icons.delete, color: Colors.white),
                            ),
                            onDismissed: (_) {
                              setState(() => _screens.removeAt(index));
                              _persistScreens();
                            },
                            child: ListTile(
                              leading: const Icon(Icons.dashboard_customize),
                              title: Text(screen.title),
                              subtitle: Text('${screen.widgets.length} elemento(s)'),
                              trailing: IconButton(
                                icon: const Icon(Icons.edit_outlined),
                                tooltip: 'Editar',
                                onPressed: () async {
                                  final updated = await Navigator.push<ScreenSpec>(
                                    context,
                                    MaterialPageRoute(builder: (_) => ScreenEditorScreen(spec: screen)),
                                  );
                                  if (updated == null) return;
                                  setState(() => _screens[index] = updated);
                                  await _persistScreens();
                                },
                              ),
                              onTap: () => Navigator.push(
                                context,
                                MaterialPageRoute(builder: (_) => DynamicScreenView(spec: screen)),
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _generating ? null : _showGenerateDialog,
        icon: _generating
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : const Icon(Icons.auto_awesome),
        label: Text(_generating ? 'Generando...' : 'Generar pantalla'),
      ),
    );
  }
}