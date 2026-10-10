/// Token de acceso de Hugging Face, necesario para descargar el modelo
/// Gemma (está protegido por la licencia de Google). Conseguilo en
/// https://huggingface.co/settings/tokens (alcanza con uno de tipo "Read"),
/// después de aceptar la licencia del modelo en su página.
///
/// ⚠️ Si subís este proyecto a un repositorio público, no dejes tu token
/// real acá adentro — movelo a una variable de entorno o a un archivo
/// separado ignorado por git. Para un repo privado de la materia, dejarlo
/// acá es aceptable.
const String huggingFaceToken = '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';