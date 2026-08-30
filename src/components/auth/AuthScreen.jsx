import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, CircleAlert, Cloud, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Logo } from "../brand/Logo";

export function AuthScreen() {
  const { configured, signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage(""); setSuccess(false);
    const action = mode === "signup" ? signUp : signIn;
    const { data, error } = await action(form.email.trim(), form.password);
    setBusy(false);
    if (error) { setMessage(error.message === "Invalid login credentials" ? "El correo o la contraseña no son correctos." : error.message); return; }
    if (mode === "signup" && !data.session) {
      setSuccess(true);
      setMessage("Cuenta creada. Revisá tu correo para confirmar el acceso.");
    }
  };
  const recoverAccess = async () => {
    const email = form.email.trim();
    if (!email) { setSuccess(false); setMessage("Ingresá tu correo para enviarte el enlace de recuperación."); return; }
    setBusy(true); setMessage("");
    const { error } = await resetPassword(email);
    setBusy(false); setSuccess(!error); setMessage(error?.message || "Te enviamos un enlace para recuperar el acceso.");
  };

  if (!configured) return <main className="auth-shell"><section className="auth-card"><Logo/><div className="auth-config-error"><CircleAlert/><h1>Falta configurar Supabase</h1><p>Agregá la URL y la clave pública del proyecto para habilitar el acceso.</p></div></section></main>;

  return <main className="auth-shell">
    <motion.section className="auth-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <Logo/>
      <div className="auth-heading"><span><Cloud size={14}/> Operaciones sincronizadas</span><h1>{mode === "signin" ? "Entrá a Llegue" : "Creá tu acceso"}</h1><p>Las rutas y entregas quedarán respaldadas de forma privada en Supabase.</p></div>
      <form onSubmit={submit}>
        <label>Correo electrónico<div><Mail size={17}/><input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="tu@empresa.com" required/></div></label>
        <label>Contraseña<div><LockKeyhole size={17}/><input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength="8" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Mínimo 8 caracteres" required/></div></label>
        {message && <div className={`auth-message ${success ? "success" : "error"}`}>{success ? <CheckCircle2 size={16}/> : <CircleAlert size={16}/>}<span>{message}</span></div>}
        <button type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17}/> Procesando…</> : <>{mode === "signin" ? "Ingresar" : "Crear cuenta"}<ArrowRight size={17}/></>}</button>
      </form>
      {mode === "signin" && <button type="button" className="auth-recover" onClick={recoverAccess} disabled={busy}>Olvidé mi contraseña</button>}
      <div className="auth-switch">{mode === "signin" ? "¿Es tu primera vez?" : "¿Ya tenés una cuenta?"}<button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signin" ? "Crear acceso" : "Ingresar"}</button></div>
    </motion.section>
  </main>;
}
