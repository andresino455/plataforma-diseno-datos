import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/screen_spec.dart';

/// Guarda las pantallas generadas en el almacenamiento local del celular,
/// para que sobrevivan a cerrar la app. No depende de internet ni del
/// backend — funciona siempre, sea cual sea el modo de IA usado para
/// generarlas originalmente.
class ScreenStorageService {
  static const _storageKey = 'saved_screens_v1';

  Future<List<ScreenSpec>> loadScreens() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    if (raw == null) return [];

    try {
      final List<dynamic> list = jsonDecode(raw);
      return list.map((e) => ScreenSpec.fromJson(e as Map<String, dynamic>)).toList();
    } catch (e) {
      // Si el formato guardado quedó corrupto (ej. por una versión vieja
      // de la app), preferimos arrancar de cero antes que crashear.
      return [];
    }
  }

  Future<void> saveScreens(List<ScreenSpec> screens) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = jsonEncode(screens.map((s) => s.toJson()).toList());
    await prefs.setString(_storageKey, raw);
  }
}