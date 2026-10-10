import 'package:flutter/material.dart';
import 'screens/my_screens_home.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Front Móvil',
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF2B7A78), // mismo verde del editor web
        useMaterial3: true,
      ),
      home: const MyScreensHome(),
    );
  }
}