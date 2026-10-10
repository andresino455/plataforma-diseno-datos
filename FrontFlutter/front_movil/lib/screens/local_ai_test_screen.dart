import 'package:flutter/material.dart';
import '../services/gemma_local_ai_service.dart';

/// Pantalla de diagnóstico, no forma parte del flujo real de la app.
/// Sirve para validar en tu celular específico que el modelo local carga y
/// responde algo, ANTES de invertir tiempo integrándolo al generador de
/// pantallas real. Una vez confirmado que funciona acá, seguimos con la
/// integración de verdad.
class LocalAiTestScreen extends StatefulWidget {
  const LocalAiTestScreen({super.key});

  @override
  State<LocalAiTestScreen> createState() => _LocalAiTestScreenState();
}

class _LocalAiTestScreenState extends State<LocalAiTestScreen> {
  final GemmaLocalAiService _service = GemmaLocalAiService();
  final TextEditingController _promptController = TextEditingController(text: 'Decí "hola" en una palabra.');

  double _downloadProgress = 0;
  bool _initializing = false;
  bool _generating = false;
  String? _response;
  String? _error;

  Future<void> _initializeModel() async {
    setState(() {
      _initializing = true;
      _error = null;
      _downloadProgress = 0;
    });

    try {
      await _service.initialize(onProgress: (p) => setState(() => _downloadProgress = p));
      setState(() {});
    } catch (e) {
      setState(() => _error = 'Error al inicializar: $e');
    } finally {
      setState(() => _initializing = false);
    }
  }

  Future<void> _testGenerate() async {
    setState(() {
      _generating = true;
      _error = null;
      _response = null;
    });

    try {
      final result = await _service.generate(
        systemPrompt: 'Respondé siempre en español, de forma breve.',
        userPrompt: _promptController.text.trim(),
      );
      setState(() => _response = result);
    } catch (e) {
      setState(() => _error = 'Error al generar: $e');
    } finally {
      setState(() => _generating = false);
    }
  }

  @override
  void dispose() {
    _service.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Prueba de IA local (diagnóstico)')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Modelo: ${_service.isReady ? "✅ cargado en memoria" : "⏳ no inicializado"}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),

            FilledButton(
              onPressed: _initializing ? null : _initializeModel,
              child: Text(_initializing
                  ? 'Descargando/cargando... ${(_downloadProgress * 100).toStringAsFixed(0)}%'
                  : (_service.isReady ? 'Recargar modelo' : 'Descargar e inicializar modelo (~550MB, una vez)')),
            ),
            if (_initializing) ...[
              const SizedBox(height: 8),
              LinearProgressIndicator(value: _downloadProgress),
            ],

            const SizedBox(height: 24),
            const Divider(),
            const SizedBox(height: 12),

            TextField(
              controller: _promptController,
              decoration: const InputDecoration(
                labelText: 'Prompt de prueba',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: (_service.isReady && !_generating) ? _testGenerate : null,
              child: Text(_generating ? 'Generando...' : 'Preguntarle al modelo local'),
            ),

            const SizedBox(height: 24),
            if (_error != null)
              Container(
                padding: const EdgeInsets.all(12),
                color: Colors.red.withValues(alpha: 0.1),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            if (_response != null)
              Container(
                padding: const EdgeInsets.all(12),
                color: Colors.green.withValues(alpha: 0.1),
                child: Text(_response!),
              ),
          ],
        ),
      ),
    );
  }
}