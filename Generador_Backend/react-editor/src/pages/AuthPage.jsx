import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import "../styles/auth.css";

export default function AuthPage() {
  const { login, register, bootError } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  function switchMode() {
    setMode(isRegister ? "login" : "register");
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (isRegister && password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    try {
      if (isRegister) await register(name, email, password);
      else await login(email, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
    // Si salió bien, el Gate de App.jsx detecta el usuario y reemplaza esta pantalla.
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Editor de Modelo de Datos</h1>
        <p className="auth-subtitle">
          {isRegister ? "Creá tu cuenta para empezar a diseñar" : "Iniciá sesión para continuar"}
        </p>

        {bootError && <p className="auth-error">{bootError}</p>}

        {isRegister && (
          <div className="auth-field">
            <label htmlFor="auth-name">Nombre</label>
            <input
              id="auth-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={60}
            />
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="auth-email">Correo</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="auth-field">
          <label htmlFor="auth-password">Contraseña</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isRegister ? 8 : undefined}
          />
          {isRegister && <span className="auth-hint">Mínimo 8 caracteres.</span>}
        </div>

        {isRegister && (
          <div className="auth-field">
            <label htmlFor="auth-password2">Repetir contraseña</label>
            <input
              id="auth-password2"
              type="password"
              autoComplete="new-password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
            />
          </div>
        )}

        {error && <p className="auth-error">{error}</p>}

        <button className="primary auth-submit" type="submit" disabled={busy}>
          {busy ? "Un momento..." : isRegister ? "Crear cuenta" : "Iniciar sesión"}
        </button>

        <p className="auth-switch">
          {isRegister ? "¿Ya tenés cuenta?" : "¿Todavía no tenés cuenta?"}{" "}
          <button type="button" className="link-btn" onClick={switchMode}>
            {isRegister ? "Iniciá sesión" : "Registrate"}
          </button>
        </p>
      </form>
    </div>
  );
}
