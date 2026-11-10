// Punto único de comunicación con el servidor (generator).
//  - Desarrollo (npm run dev): el editor corre en :5173 y el servidor en :4000.
//  - Producción (Render): el servidor también entrega el editor, así que todo
//    está en la misma dirección y se usan URLs relativas (y wss:// con https).
//  - Si el servidor está en otra dirección, definí VITE_API_URL al compilar.
const configuredUrl = import.meta.env.VITE_API_URL;

export const API_BASE =
  configuredUrl !== undefined
    ? configuredUrl.replace(/\/$/, "")
    : import.meta.env.DEV
      ? "http://localhost:4000"
      : "";

export const WS_BASE = API_BASE
  ? API_BASE.replace(/^http/, "ws")
  : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;

const TOKEN_KEY = "auth_token";

// La sesión se guarda en el navegador (localStorage) para que no haya que
// volver a loguearse al recargar la página. Se borra al cerrar sesión.
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Almacenamiento bloqueado por el navegador: la sesión dura solo hasta recargar.
  }
}

// Headers con el token de sesión, para los fetch que hacen su propio manejo (descarga del zip, etc.).
export function authHeaders(extra = {}) {
  const token = getToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// AuthContext registra acá qué hacer cuando el servidor responde 401 con una
// sesión guardada (token vencido o usuario eliminado): cerrar sesión.
let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

/**
 * fetch + JSON + token de sesión. Lanza Error con un mensaje listo para mostrar.
 * @param {string} path - por ejemplo "/api/projects"
 * @param {{ method?: string, body?: object }} [options]
 */
export async function apiFetch(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: authHeaders(body !== undefined ? { "Content-Type": "application/json" } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor. ¿Está corriendo 'npm start' en la carpeta generator?");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && getToken()) unauthorizedHandler?.();
    const error = new Error(data.error || `El servidor respondió ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return data;
}
