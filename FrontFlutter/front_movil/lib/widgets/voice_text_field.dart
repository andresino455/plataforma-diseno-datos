import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// TextField con un botón de micrófono al lado. Al tocarlo, transcribe lo
/// que se dice y lo escribe en el mismo controller — el resto del diálogo
/// que lo use no necesita saber nada de voz, solo lee controller.text al
/// final, igual que si el usuario hubiera escrito.
class VoiceTextField extends StatefulWidget {
  final TextEditingController controller;
  final String hintText;

  const VoiceTextField({super.key, required this.controller, required this.hintText});

  @override
  State<VoiceTextField> createState() => _VoiceTextFieldState();
}

class _VoiceTextFieldState extends State<VoiceTextField> {
  final SpeechToText _speech = SpeechToText();
  bool _speechAvailable = false;
  bool _listening = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initSpeech();
  }

  Future<void> _initSpeech() async {
    try {
      final available = await _speech.initialize(
        onStatus: (status) {
          if (status == 'done' || status == 'notListening') {
            if (mounted) setState(() => _listening = false);
          }
        },
        onError: (error) {
          if (mounted) setState(() => _listening = false);
        },
      );
      if (mounted) setState(() => _speechAvailable = available);
    } catch (e) {
      if (mounted) setState(() => _error = 'No se pudo iniciar el reconocimiento de voz: $e');
    }
  }

  Future<void> _toggleListening() async {
    if (_listening) {
      await _speech.stop();
      setState(() => _listening = false);
      return;
    }

    setState(() => _listening = true);
    await _speech.listen(
      localeId: 'es_ES',
      onResult: (result) {
        widget.controller.text = result.recognizedWords;
        widget.controller.selection = TextSelection.fromPosition(
          TextPosition(offset: widget.controller.text.length),
        );
      },
    );
  }

  @override
  void dispose() {
    _speech.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                controller: widget.controller,
                autofocus: true,
                maxLines: 3,
                decoration: InputDecoration(hintText: widget.hintText),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              onPressed: _speechAvailable ? _toggleListening : null,
              icon: Icon(_listening ? Icons.mic : Icons.mic_none),
              color: _listening ? Colors.red : null,
              tooltip: _speechAvailable
                  ? (_listening ? 'Detener' : 'Hablar')
                  : 'Reconocimiento de voz no disponible en este dispositivo',
            ),
          ],
        ),
        if (_listening)
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text('🎤 Escuchando...', style: TextStyle(color: Colors.red, fontSize: 12)),
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(_error!, style: const TextStyle(color: Colors.orange, fontSize: 12)),
          ),
      ],
    );
  }
}