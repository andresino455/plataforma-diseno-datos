import 'package:flutter_gemma/flutter_gemma.dart';
import '../local_ai_config.dart';
import 'local_ai_service.dart';

/// Implementación con el paquete flutter_gemma: corre Gemma 3 1B
/// (instruction-tuned, cuantizado a int4, ~550MB) enteramente en el
/// dispositivo. Se descarga una sola vez la primera vez que se usa; después
/// funciona sin conexión a internet.
///
/// ⚠️ IMPORTANTE: la API pública de flutter_gemma cambió más de una vez
/// entre versiones (desde `Gemma.instance.init()` en versiones viejas hasta
/// el esquema con `installModel().fromNetwork()` en versiones nuevas). Este
/// código está escrito contra la API "moderna". Si `flutter pub add
/// flutter_gemma` te instala una versión con otra forma de uso y esto no
/// compila, mirá la pestaña "Example" de pub.dev para la versión que se
/// instaló, y ajustamos este archivo — es el ÚNICO lugar del proyecto que
/// necesitaría cambiar.
class GemmaLocalAiService implements LocalAiService {
  InferenceModel? _model;
  InferenceModelSession? _session;

  @override
  bool get isReady => _session != null;

  @override
  Future<void> initialize({void Function(double progress)? onProgress}) async {
    if (isReady) return;

    // El token solo hace falta si cambiás a la fuente oficial de Google
    // (ver comentario más abajo); con el espejo público no se usa.
    await FlutterGemma.initialize(
      huggingFaceToken: huggingFaceToken == 'PEGÁ_ACÁ_TU_TOKEN_HF' ? null : huggingFaceToken,
    );

    // Gemma 2 2B (q8), espejo público sin restricciones, empaquetado
    // específicamente como bundle de MediaPipe LLM Inference para Android
    // (no la variante "-web", que tiene un formato de zip interno distinto
    // y no carga en el runtime nativo — ver el error "Unable to open zip
    // archive" si alguna vez volvés a toparte con esto).
    final builder = FlutterGemma.installModel(modelType: ModelType.gemmaIt).fromNetwork(
      'https://huggingface.co/saifullahalahad/marifa-models/resolve/main/Gemma2-2B-IT_multi-prefill-seq_q8_ekv1280.task',
    );

    if (onProgress != null) {
      // En flutter_gemma 0.12.6, withProgress entrega un int (0 a 100).
      builder.withProgress((progress) => onProgress(progress / 100));
    }

    await builder.install();

    _model = await FlutterGemma.getActiveModel(maxTokens: 1024);
    _session = await _model!.createSession();
  }

  @override
  Future<String> generate({required String systemPrompt, required String userPrompt}) async {
    if (_session == null) {
      throw StateError('El modelo local todavía no se inicializó. Llamá a initialize() primero.');
    }

    await _session!.addQueryChunk(Message(text: systemPrompt, isUser: false));
    await _session!.addQueryChunk(Message(text: userPrompt, isUser: true));
    return _session!.getResponse();
  }

  Future<void> dispose() async {
    await _session?.close();
    await _model?.close();
    _session = null;
    _model = null;
  }
}