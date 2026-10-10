/// Abstracción para que el resto de la app no dependa de qué paquete o
/// modelo de IA local termine funcionando en la práctica. Si el paquete
/// elegido (flutter_gemma) da problemas en algún celular, alcanza con
/// reemplazar la implementación de esta interfaz por otra (ej. un plugin
/// de llama.cpp) sin tocar el resto del código.
abstract class LocalAiService {
  /// true una vez que el modelo está descargado y cargado en memoria.
  bool get isReady;

  /// Descarga (la primera vez) y carga el modelo en memoria. onProgress
  /// informa el avance de la descarga (0.0 a 1.0) para mostrar en la UI.
  Future<void> initialize({void Function(double progress)? onProgress});

  /// Le pasa un prompt de sistema + uno de usuario al modelo local y
  /// devuelve el texto crudo de la respuesta.
  Future<String> generate({required String systemPrompt, required String userPrompt});
}