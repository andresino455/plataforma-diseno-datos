/// Con el celular conectado por USB, "adb reverse tcp:8080 tcp:8080" hace que
/// "localhost" en el celular apunte al backend que corre en la PC. Si en algún
/// momento probás por WiFi en vez de USB, cambiá esto por la IP de tu PC en la
/// red local (ej. "http://192.168.1.5:8080") — es el único lugar del proyecto
/// que necesitás tocar.
const String apiBaseUrl = 'http://localhost:8080';
//const String apiBaseUrl = 'http:192.168.0.8:8080';
