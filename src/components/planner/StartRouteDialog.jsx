import { motion } from "framer-motion";
import { AlertTriangle, Check, CircleAlert, LoaderCircle, MessageCircle, PhoneOff, Route, Send, X } from "lucide-react";
import { useMemo, useState } from "react";
import { registerTracking } from "../../services/tracking";
import { createTrackingUrl, customerMessage, normalizePhone, openWhatsApp } from "../../utils/customerCommunication";

function stopIssues(stop) {
  const issues = [];
  if (!String(stop.address || "").trim()) issues.push("Falta dirección");
  if (!String(stop.client || "").trim() || stop.client === "Nuevo destinatario") issues.push("Falta cliente");
  if (!normalizePhone(stop.phone)) issues.push("Teléfono inválido");
  if (!String(stop.schedule || "").trim() || stop.schedule === "Horario abierto") issues.push("Horario abierto");
  return issues;
}

export function StartRouteDialog({ route, stops, onClose, onStart, onUpdateStop }) {
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [entries, setEntries] = useState({});
  const checks = useMemo(() => stops.map((stop) => ({ stop, issues: stopIssues(stop) })), [stops]);
  const validPhones = checks.filter(({ stop }) => normalizePhone(stop.phone)).length;
  const issueCount = checks.filter(({ issues }) => issues.length).length;
  const readyCount = Object.values(entries).filter((entry) => entry.status === "ready" || entry.status === "sent").length;
  const sentCount = Object.values(entries).filter((entry) => entry.status === "sent").length;

  const prepare = async () => {
    setPreparing(true);
    const nextEntries = {};
    await Promise.all(checks.map(async ({ stop, issues }) => {
      try {
        const registration = await registerTracking(route, stop);
        const trackingUrl = createTrackingUrl(route, stop, registration?.publicToken);
        nextEntries[stop.id] = {
          status: "ready",
          issues,
          trackingUrl,
          message: customerMessage("en_route", route, stop, trackingUrl),
        };
        onUpdateStop(stop.id, { notificationStatus: normalizePhone(stop.phone) ? "lista" : "sin_telefono", trackingPreparedAt: new Date().toISOString() });
      } catch (error) {
        nextEntries[stop.id] = { status: "error", issues, error: error.message };
        onUpdateStop(stop.id, { notificationStatus: "error" });
      }
    }));
    setEntries(nextEntries);
    setPrepared(true);
    setPreparing(false);
  };

  const send = (stop) => {
    const entry = entries[stop.id];
    if (!entry?.message || !openWhatsApp(stop.phone, entry.message)) return;
    const sentAt = new Date().toISOString();
    setEntries((current) => ({ ...current, [stop.id]: { ...current[stop.id], status: "sent" } }));
    onUpdateStop(stop.id, { notificationStatus: "enviada", lastNotificationAt: sentAt });
  };

  return <div className="start-dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <motion.section className="start-route-dialog" role="dialog" aria-modal="true" aria-labelledby="start-route-title" initial={{ opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} onMouseDown={(event) => event.stopPropagation()}>
      <header className="start-dialog-heading">
        <div><span>Control de salida</span><h2 id="start-route-title">Preparar el recorrido</h2><p>Revisá los datos y dejá listos los avisos antes de arrancar.</p></div>
        <button type="button" onClick={onClose} aria-label="Cerrar"><X size={19}/></button>
      </header>

      <div className="start-check-summary">
        <div><Route size={17}/><span><strong>{stops.length}</strong> pedidos</span></div>
        <div className={validPhones === stops.length ? "ok" : "warning"}><MessageCircle size={17}/><span><strong>{validPhones}</strong> teléfonos listos</span></div>
        <div className={issueCount ? "warning" : "ok"}>{issueCount ? <AlertTriangle size={17}/> : <Check size={17}/>}<span><strong>{issueCount}</strong> con observaciones</span></div>
      </div>

      <div className="start-stop-list">
        {checks.map(({ stop, issues }, index) => {
          const entry = entries[stop.id];
          const canSend = entry?.status === "ready" || entry?.status === "sent";
          return <article className="start-stop-row" key={stop.id}>
            <span className="start-stop-number">{index + 1}</span>
            <div className="start-stop-copy"><strong>{stop.client || "Sin cliente"}</strong><span>{stop.shortAddress || stop.address || "Sin dirección"}</span>{issues.length > 0 && <small><CircleAlert size={12}/>{issues.join(" · ")}</small>}{entry?.error && <small className="error"><CircleAlert size={12}/>{entry.error}</small>}</div>
            <div className="start-stop-action">
              {entry?.status === "sent" ? <span className="sent"><Check size={14}/> Enviado</span>
                : canSend && normalizePhone(stop.phone) ? <button type="button" onClick={() => send(stop)}><Send size={14}/> WhatsApp</button>
                : entry?.status === "error" ? <span className="failed">Error</span>
                : !normalizePhone(stop.phone) ? <span className="no-phone"><PhoneOff size={14}/> Sin teléfono</span>
                : <span className="pending">Pendiente</span>}
            </div>
          </article>;
        })}
      </div>

      <footer className="start-dialog-footer">
        <div>{prepared ? <><strong>{readyCount}/{stops.length}</strong> seguimientos listos{sentCount ? ` · ${sentCount} enviados` : ""}</> : "Todavía no se enviará ningún mensaje automáticamente."}</div>
        <button type="button" className="start-secondary" onClick={onClose}>Volver</button>
        {!prepared ? <button type="button" className="start-primary" disabled={preparing} onClick={prepare}>{preparing ? <><LoaderCircle className="spin" size={16}/> Preparando…</> : <><MessageCircle size={16}/> Preparar avisos</>}</button>
          : <button type="button" className="start-primary" onClick={onStart}><Route size={16}/> Iniciar recorrido</button>}
      </footer>
    </motion.section>
  </div>;
}

