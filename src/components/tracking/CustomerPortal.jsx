import { motion } from "framer-motion";
import { Check, CheckCircle2, Clock3, MapPin, Navigation, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRoute } from "../../contexts/RouteContext";
import { shareTracking } from "../../utils/customerCommunication";
import { subscribeWorkspace } from "../../utils/storage";
import { subscribeTracking } from "../../services/tracking";
import { Logo } from "../brand/Logo";
import { RouteMap } from "../map/RouteMap";

const statusDetails = {
  pendiente: { label: "Entrega programada", description: "Estamos preparando tu pedido para incorporarlo al recorrido.", step: 1 },
  en_camino: { label: "Tu entrega está en camino", description: "El conductor está avanzando hacia tu ubicación.", step: 2 },
  completada: { label: "Entrega completada", description: "El pedido llegó a destino correctamente.", step: 3 },
  no_entregada: { label: "Entrega a reprogramar", description: "No pudimos completar la visita. Nos comunicaremos con vos.", step: 2 },
};

export function CustomerPortal({ snapshot, publicToken = "" }) {
  const { routes } = useRoute();
  const [copied, setCopied] = useState(false);
  const [externalRoutes, setExternalRoutes] = useState(null);
  const [remoteSnapshot, setRemoteSnapshot] = useState(null);
  const [remoteError, setRemoteError] = useState("");
  useEffect(() => publicToken
    ? subscribeTracking(publicToken, (next) => { setRemoteSnapshot(next); setRemoteError(""); }, (error) => setRemoteError(error.message))
    : subscribeWorkspace((workspace) => setExternalRoutes(workspace?.routes || null)), [publicToken]);
  const live = useMemo(() => {
    if (remoteSnapshot) return remoteSnapshot;
    if (!snapshot) return null;
    const route = (externalRoutes || routes).find((item) => item.id === snapshot.routeId);
    const stop = route?.stops?.find((item) => item.id === snapshot.stopId);
    return route && stop ? { ...snapshot, routeName: route.name, driver: route.driver, vehicle: route.vehicle, ...stop } : snapshot;
  }, [externalRoutes, remoteSnapshot, routes, snapshot]);
  if (!live) return <main className="tracking-shell"><div className="tracking-content"><section className="tracking-hero"><div className="tracking-status-icon"><Truck size={28}/></div><h1>{remoteError ? "No pudimos cargar el seguimiento" : "Cargando seguimiento…"}</h1><p>{remoteError || "Estamos consultando el estado más reciente de tu entrega."}</p></section></div></main>;
  const status = statusDetails[live.status] || statusDetails.pendiente;
  const mapsUrl = live.coordinates?.length === 2 ? `https://www.google.com/maps/search/?api=1&query=${live.coordinates[1]},${live.coordinates[0]}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(live.address)}`;
  const updatedAt = new Date(live.updatedAt || live.generatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const copyLink = async () => {
    const result = await shareTracking("Seguimiento de entrega de Llegue", window.location.href);
    if (result === "copied") { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };

  return <motion.main className="tracking-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <header className="tracking-header"><Logo/><span><ShieldCheck size={14}/> Seguimiento de entrega</span></header>
    <div className="tracking-content">
      <section className="tracking-hero">
        <div className={`tracking-status-icon tracking-status-${live.status}`}><Truck size={28}/></div>
        <span>Entrega para {live.customer}</span>
        <h1>{status.label}</h1>
        <p>{status.description}</p>
        <small>Última actualización · {updatedAt}</small>
      </section>

      <section className="tracking-progress" aria-label="Progreso de la entrega">
        {[{ icon: PackageCheck, label: "Preparando" }, { icon: Navigation, label: "En camino" }, { icon: CheckCircle2, label: "Entregado" }].map(({ icon: Icon, label }, index) => <div key={label} className={index < status.step ? "complete" : ""}><span><Icon size={17}/></span><strong>{label}</strong>{index < 2 && <i/>}</div>)}
      </section>

      <section className="tracking-card">
        <div className="tracking-card-row"><span><MapPin size={18}/></span><div><small>Destino</small><strong>{live.address}</strong></div><a href={mapsUrl} target="_blank" rel="noreferrer">Ver mapa</a></div>
        <div className="tracking-card-row"><span><Clock3 size={18}/></span><div><small>Franja estimada</small><strong>{live.schedule}</strong></div></div>
        <div className="tracking-card-row"><span><Truck size={18}/></span><div><small>Entrega</small><strong>{live.driver || "Equipo Llegue"}{live.vehicle ? ` · ${live.vehicle}` : ""}</strong></div></div>
      </section>

      {live.driverCoordinates?.length === 2 && live.coordinates?.length === 2 && <section className="tracking-live-map" aria-label="Ubicación aproximada del conductor"><RouteMap stops={[{ id: live.stopId || "destination", coordinates: live.coordinates }]} selectedId={live.stopId || "destination"} onSelect={() => {}} routeData={null} currentPosition={{ coordinates: live.driverCoordinates }}/><div className="tracking-map-label">Ubicación aproximada del conductor{live.eta ? ` · llegada ${new Date(live.eta).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : ""}</div></section>}

      <button className="tracking-share" onClick={copyLink}>{copied ? <><Check size={17}/> Enlace copiado</> : "Compartir seguimiento"}</button>
      <p className="tracking-help">¿Necesitás ayuda? Respondé al mensaje que recibiste.</p>
      <p className="tracking-disclaimer">La ubicación se muestra de forma aproximada para proteger al conductor y al destinatario.</p>
    </div>
  </motion.main>;
}
