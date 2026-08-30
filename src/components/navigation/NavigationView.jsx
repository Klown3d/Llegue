import { motion } from "framer-motion";
import { AlertTriangle, ChevronUp, CircleCheck, Flag, Gauge, LocateFixed, LoaderCircle, Menu, MessageCircle, Navigation2, Phone, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "../../contexts/RouteContext";
import { useGeolocation } from "../../hooks/useGeolocation";
import { fetchDirections } from "../../services/mapbox";
import { distanceMeters, getNavigationState, getReliableGpsSegment } from "../../utils/navigation";
import { canSpeak, speakSpanish } from "../../utils/speech";
import { createTrackingUrl, customerMessage, openWhatsApp } from "../../utils/customerCommunication";
import { registerTracking, sendTrackingEvent } from "../../services/tracking";
import { RouteMap } from "../map/RouteMap";
import { Logo } from "../brand/Logo";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";

function formatRemaining(seconds) { return Math.max(0, Math.round(seconds / 60)); }
function formatDistance(meters) { return meters < 1000 ? `${Math.max(0, Math.round(meters))} m` : `${(meters / 1000).toFixed(1)} km`; }

export function NavigationView({ onFinish }) {
  const { currentRouteId, stops, selectedId, setSelectedId, updateStop, routeOrigin, routeData, setRouteData, routeMeta, runtimeStats, updateRuntimeStats } = useRoute();
  const { position, error: locationError, status: locationStatus } = useGeolocation(true);
  const online = useOnlineStatus();
  const [muted, setMuted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [routingStatus, setRoutingStatus] = useState("idle");
  const [routingError, setRoutingError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const lastRouteAt = useRef(0);
  const lastStopKey = useRef("");
  const spokenInstruction = useRef("");
  const announcedStop = useRef("");
  const announcedArrival = useRef("");
  const lastTrackingAt = useRef(0);
  const lastGpsPoint = useRef(null);
  const metricsBuffer = useRef({ distanceMeters: 0, durationSeconds: 0, lastFlushAt: 0 });
  const incidents = runtimeStats.incidents || [];

  const activeIndex = useMemo(() => stops.findIndex((stop) => !["completada", "no_entregada"].includes(stop.status)), [stops]);
  const returnStop = useMemo(() => routeMeta.returnToOrigin && routeOrigin?.coordinates ? { id: "return-to-origin", address: "Punto de partida", shortAddress: "Punto de partida", client: "Regreso a base", schedule: "Fin del recorrido", coordinates: routeOrigin.coordinates, status: "pendiente" } : null, [routeMeta.returnToOrigin, routeOrigin?.coordinates]);
  const isReturnLeg = activeIndex < 0 && Boolean(returnStop);
  const activeStop = activeIndex >= 0 ? stops[activeIndex] : returnStop;
  const remainingStops = useMemo(() => [...stops.filter((stop) => !["completada", "no_entregada"].includes(stop.status)), ...(returnStop ? [returnStop] : [])], [returnStop, stops]);
  const navState = useMemo(() => getNavigationState(position?.coordinates, routeData), [position, routeData]);
  const arrivalDistance = distanceMeters(position?.coordinates, activeStop?.coordinates);
  const arrived = arrivalDistance <= 80;
  const speed = Math.max(0, Math.round((position?.speed || 0) * 3.6));
  const eta = new Date(Date.now() + (navState?.remainingSeconds || routeData?.duration || 0) * 1000).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  const calculateFromPosition = useCallback(async (force = false) => {
    if (!position?.coordinates || !remainingStops.length || routingStatus === "loading") return;
    const stopKey = remainingStops.map((stop) => stop.id).join("|");
    const shouldReroute = force || !routeData || stopKey !== lastStopKey.current || (navState?.offRouteMeters > 60 && Date.now() - lastRouteAt.current > 12000);
    if (!shouldReroute) return;
    setRoutingStatus("loading"); setRoutingError("");
    try {
      const nextRoute = await fetchDirections(remainingStops, { origin: position.coordinates });
      setRouteData(nextRoute); lastRouteAt.current = Date.now(); lastStopKey.current = stopKey; setRoutingStatus("ready");
    } catch (error) { setRoutingStatus("error"); setRoutingError(error.message); }
  }, [navState?.offRouteMeters, position, remainingStops, routeData, routingStatus, setRouteData]);

  useEffect(() => { calculateFromPosition(); }, [calculateFromPosition]);

  useEffect(() => {
    if (!position?.coordinates) return;
    const timestamp = Number(position.timestamp || Date.now());
    const currentPoint = { coordinates: position.coordinates, accuracy: position.accuracy, timestamp };
    const previous = lastGpsPoint.current;
    lastGpsPoint.current = currentPoint;
    if (!previous) { metricsBuffer.current.lastFlushAt = timestamp; return; }
    const segment = getReliableGpsSegment(previous, currentPoint);
    if (!segment) return;
    metricsBuffer.current.distanceMeters += segment.distanceMeters;
    metricsBuffer.current.durationSeconds += segment.durationSeconds;
    if (timestamp - metricsBuffer.current.lastFlushAt < 10_000) return;
    const patch = { distanceMeters: metricsBuffer.current.distanceMeters, durationSeconds: metricsBuffer.current.durationSeconds };
    metricsBuffer.current = { distanceMeters: 0, durationSeconds: 0, lastFlushAt: timestamp };
    updateRuntimeStats((current) => ({ ...current, distanceMeters: (current.distanceMeters || 0) + patch.distanceMeters, durationSeconds: (current.durationSeconds || 0) + patch.durationSeconds }));
  }, [position, updateRuntimeStats]);

  const speak = useCallback((text, force = false) => {
    if ((!force && muted) || !canSpeak()) return false;
    return speakSpanish(text, { onStart: () => setIsSpeaking(true), onEnd: () => setIsSpeaking(false) });
  }, [muted]);

  useEffect(() => {
    const instruction = navState?.instruction;
    if (muted || !instruction || instruction === spokenInstruction.current) return;
    spokenInstruction.current = instruction;
    speak(instruction);
  }, [muted, navState?.instruction, speak]);

  useEffect(() => {
    if (!activeStop || announcedStop.current === activeStop.id) return;
    if (speak(`Próxima ubicación: ${activeStop.address}. Entrega para ${activeStop.client}.`)) {
      announcedStop.current = activeStop.id;
      announcedArrival.current = "";
    }
  }, [activeStop, speak]);

  useEffect(() => {
    if (!arrived || !activeStop || announcedArrival.current === activeStop.id) return;
    if (speak(`Llegaste a ${activeStop.address}. Entrega para ${activeStop.client}.`)) announcedArrival.current = activeStop.id;
  }, [activeStop, arrived, speak]);

  useEffect(() => {
    if (!activeStop || isReturnLeg || !position?.coordinates || !navState || Date.now() - lastTrackingAt.current < 15_000) return;
    lastTrackingAt.current = Date.now();
    const route = { id: currentRouteId, ...routeMeta };
    const driverCoordinates = position.coordinates.map((value) => Number(value.toFixed(4)));
    const etaAt = new Date(Date.now() + (navState.remainingSeconds || 0) * 1000).toISOString();
    const snapshot = { driverCoordinates, eta: etaAt, progress: Math.round(navState.progress || 0), arrived };
    updateStop(activeStop.id, snapshot);
    sendTrackingEvent(route, { ...activeStop, ...snapshot }, "delivery.eta_changed", { source: "navigation", snapshot }).catch((error) => setRoutingError(`Seguimiento pendiente: ${error.message}`));
  }, [activeStop, arrived, currentRouteId, isReturnLeg, navState, position, routeMeta, updateStop]);

  useEffect(() => () => {
    if (canSpeak()) window.speechSynthesis.cancel();
  }, []);

  const completeStop = async () => {
    if (!activeStop) return;
    if (isReturnLeg) { finish(); return; }
    const completedAt = new Date().toISOString();
    const completedStop = { ...activeStop, status: "completada", completedAt, updatedAt: completedAt };
    updateStop(activeStop.id, completedStop);
    const route = { id: currentRouteId, ...routeMeta };
    try { await sendTrackingEvent(route, completedStop, "delivery.completed", { source: "navigation", snapshot: { status: "completada", completedAt, progress: 100 } }); }
    catch (error) { setRoutingError(`La entrega se guardó, pero el seguimiento quedó pendiente: ${error.message}`); }
    const next = stops.slice(activeIndex + 1).find((stop) => !["completada", "no_entregada"].includes(stop.status)); if (next) setSelectedId(next.id);
  };

  const finish = () => {
    const distanceMetersTotal = (runtimeStats.distanceMeters || 0) + metricsBuffer.current.distanceMeters;
    const durationSecondsTotal = (runtimeStats.durationSeconds || 0) + metricsBuffer.current.durationSeconds;
    updateRuntimeStats((current) => ({ ...current, distanceMeters: distanceMetersTotal, durationSeconds: durationSecondsTotal }));
    onFinish({ distance: distanceMetersTotal > 50 ? distanceMetersTotal / 1000 : (routeData?.distance || 0) / 1000, duration: durationSecondsTotal > 30 ? Math.round(durationSecondsTotal / 60) : Math.round((routeData?.duration || 0) / 60), deliveries: stops.filter((stop) => stop.status === "completada").length, totalDeliveries: stops.length, incidents });
  };
  const failStop = async () => {
    if (!activeStop) return;
    const reason = window.prompt("Motivo de la entrega no realizada:", "Cliente ausente");
    if (!reason) return;
    const updatedAt = new Date().toISOString();
    const failedStop = { ...activeStop, status: "no_entregada", failureReason: reason, updatedAt };
    updateStop(activeStop.id, failedStop);
    try { await sendTrackingEvent({ id: currentRouteId, ...routeMeta }, failedStop, "delivery.failed", { reason, source: "navigation", snapshot: { status: "no_entregada", failureReason: reason } }); }
    catch (error) { setRoutingError(`La incidencia se guardó, pero el seguimiento quedó pendiente: ${error.message}`); }
    const next = stops[activeIndex + 1]; if (next) setSelectedId(next.id);
  };
  const reportIncident = () => {
    const description = window.prompt("Describí la incidencia:", "Demora por tránsito");
    if (!description) return;
    const incident = { type: "incidencia vial", description, coordinates: position?.coordinates || null, createdAt: new Date().toISOString() };
    updateRuntimeStats((current) => ({ ...current, incidents: [...(current.incidents || []), incident] }));
    if (activeStop) sendTrackingEvent({ id: currentRouteId, ...routeMeta }, activeStop, "delivery.exception", { ...incident, source: "navigation", snapshot: { lastIncident: description } }).catch(() => {});
  };

  const notifyCustomer = async () => {
    if (!activeStop) return;
    const nextStop = { ...activeStop, status: "en_camino", updatedAt: new Date().toISOString() };
    const route = { id: currentRouteId, ...routeMeta };
    let registration = null;
    try {
      registration = await registerTracking(route, nextStop);
      await sendTrackingEvent(route, nextStop, "delivery.en_route", { source: "navigation" });
    } catch (error) {
      setRoutingError(`No pudimos actualizar el seguimiento: ${error.message}`);
      return;
    }
    const trackingUrl = createTrackingUrl(route, nextStop, registration?.publicToken);
    if (!openWhatsApp(nextStop.phone, customerMessage("en_route", route, nextStop, trackingUrl))) return;
    updateStop(nextStop.id, { status: "en_camino", updatedAt: nextStop.updatedAt, lastNotificationAt: nextStop.updatedAt });
  };

  return <motion.main className="navigation-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <RouteMap stops={stops} selectedId={selectedId} onSelect={setSelectedId} routeData={routeData} navigation currentPosition={position} followUser/>
    <header className="nav-topbar"><Logo compact inverse/><div className={`gps-status gps-${locationStatus}`}>{locationStatus === "requesting" ? <LoaderCircle size={13}/> : <LocateFixed size={13}/>}<span>{locationStatus === "ready" ? `GPS ±${Math.round(position.accuracy)} m` : "Buscando GPS"}</span></div><button className={`nav-floating-button ${isSpeaking ? "is-speaking" : ""}`} onClick={() => setMuted((value) => { const next = !value; if (next && canSpeak()) window.speechSynthesis.cancel(); return next; })} aria-label={muted ? "Activar indicaciones" : "Silenciar indicaciones"} aria-pressed={!muted}>{muted ? <VolumeX size={19}/> : <Volume2 size={19}/>}</button><button className="nav-floating-button" onClick={() => setDetailsOpen((value) => !value)} aria-label="Menú"><Menu size={19}/></button></header>

    <section className="maneuver-panel">
      <div className={`turn-symbol turn-${(navState?.modifier || "straight").replaceAll(" ", "-")}`}><Navigation2 size={36}/></div>
      <div><span>{routingStatus === "loading" ? "Recalculando…" : `En ${formatDistance(navState?.distanceToManeuver || 0)}`}</span><h1>{navState?.instruction || "Obteniendo indicaciones"}</h1><p>{navState?.street || routeMeta.name}</p></div>
    </section>

    {(!online || locationError || routingError) && <div className="navigation-alert"><AlertTriangle size={16}/><span>{!online ? "Sin conexión: guardaremos los cambios para enviarlos al volver." : locationError || routingError}</span>{online && position && <button onClick={() => calculateFromPosition(true)}>Reintentar</button>}</div>}
    {arrived && activeStop && <motion.div className="arrival-banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}><CircleCheck size={20}/><div><strong>Llegaste a {activeStop.client}</strong><span>{activeStop.shortAddress}</span></div><button onClick={completeStop}>Completar entrega</button></motion.div>}

    <aside className="nav-side-actions"><button className={incidents.length ? "reported" : ""} onClick={reportIncident}><AlertTriangle size={19}/><span>{incidents.length ? `Reportes ${incidents.length}` : "Reportar"}</span></button><button onClick={() => calculateFromPosition(true)}><LocateFixed size={19}/><span>Recalcular</span></button><button onClick={() => setDetailsOpen((value) => !value)}><RotateCcw size={19}/><span>Resumen</span></button></aside>
    <section className="speed-cluster"><div className="speed-value"><Gauge size={14}/><strong>{speed}</strong><small>km/h · GPS</small></div></section>

    <motion.section className={`navigation-dock ${detailsOpen ? "navigation-dock-open" : ""}`} layout>
      <button className="dock-handle" onClick={() => setDetailsOpen((value) => !value)} aria-label="Ver detalles"><ChevronUp size={18} className={detailsOpen ? "rotate-180" : ""}/></button>
      <div className="progress-track"><motion.span animate={{ width: `${navState?.progress || 0}%` }}/></div>
      <div className="trip-summary"><div><strong>{formatRemaining(navState?.remainingSeconds || routeData?.duration || 0)}</strong><span>min</span><small>restantes</small></div><div><strong>{(navState?.remainingKm || (routeData?.distance || 0) / 1000).toFixed(1)}</strong><span>km</span><small>restantes</small></div><div><strong>{eta}</strong><small>llegada</small></div><div className="completion"><strong>{Math.round(navState?.progress || 0)}%</strong><small>completado</small></div></div>
      {activeStop ? <div className="active-delivery"><div className="delivery-sequence"><span>{isReturnLeg ? "↩" : activeIndex + 1}</span><div className="sequence-line"/><Flag size={15}/></div><div className="active-delivery-info min-w-0 flex-1"><small>{isReturnLeg ? arrived ? "Regreso completado" : `Regreso · ${formatDistance(arrivalDistance)}` : arrived ? "Llegaste" : activeStop.status === "en_camino" ? `Cliente avisado · ${formatDistance(arrivalDistance)}` : `Próxima entrega · ${formatDistance(arrivalDistance)}`}</small><strong>{activeStop.shortAddress}</strong><span>{activeStop.client} · {activeStop.schedule}</span></div><div className="delivery-actions">{!isReturnLeg && <><button className={`location-audio-button ${isSpeaking ? "is-speaking" : ""}`} onClick={() => speak(`Próxima ubicación: ${activeStop.address}. Entrega para ${activeStop.client}.`, true)} aria-label="Escuchar ubicación" title="Escuchar ubicación"><Volume2 size={17}/><span className="mobile-action-label">Escuchar</span></button><button className="customer-notify-button" onClick={notifyCustomer} aria-label="Avisar por WhatsApp" title="Avisar que está en camino"><MessageCircle size={17}/><span className="mobile-action-label">Avisar</span></button><a className="call-button" href={`tel:${activeStop.phone}`} aria-label="Llamar al cliente"><Phone size={17}/><span className="mobile-action-label">Llamar</span></a><button className="failed-delivery-button" onClick={failStop}><AlertTriangle size={17}/><span>No entregada</span></button></>}<button className="complete-button" onClick={completeStop}><CircleCheck size={18}/><span>{isReturnLeg ? "Finalizar regreso" : "Marcar entrega"}</span></button></div></div> : <div className="route-complete"><CircleCheck size={22}/><div><strong>Recorrido completado</strong><span>Todas las paradas fueron resueltas.</span></div></div>}
      {detailsOpen && <motion.div className="next-stops" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{remainingStops.slice(1, 3).map((stop, index) => <div key={stop.id}><span>{activeIndex + index + 2}</span><p><strong>{stop.shortAddress}</strong><small>{stop.client}</small></p><time>{stop.schedule}</time></div>)}</motion.div>}
      <button className="finish-route" onClick={finish}><X size={15}/> Finalizar recorrido</button>
    </motion.section>
  </motion.main>;
}
