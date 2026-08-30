import React from "react";
import ReactDOM from "react-dom/client";
import "mapbox-gl/dist/mapbox-gl.css";
import "./styles.css";
import App from "./App";
import { RouteProvider } from "./contexts/RouteContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthScreen } from "./components/auth/AuthScreen";

function Root() {
  const { loading, user } = useAuth();
  const hasPublicTracking = Boolean(new URLSearchParams(window.location.search).get("tracking"));
  if (loading) return <main className="auth-shell"><div className="auth-loading">Preparando Llegue…</div></main>;
  if (hasPublicTracking) return <RouteProvider><App/></RouteProvider>;
  if (!user) return <AuthScreen/>;
  return <RouteProvider><App/></RouteProvider>;
}

const root = window.__llegueRoot ||= ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AuthProvider><Root/></AuthProvider>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
