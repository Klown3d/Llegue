import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownUp, CalendarDays, Check, ChevronLeft, CircleAlert, List, LocateFixed, Map as MapIcon, MapPin, Mic, MicOff, Plus, Route, Search, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "../brand/Logo";
import { StopCard } from "./StopCard";
import { StartRouteDialog } from "./StartRouteDialog";
import { RouteMap } from "../map/RouteMap";
import { useRoute } from "../../contexts/RouteContext";
import { useRouteMetrics } from "../../hooks/useRouteMetrics";
import { demoSuggestions } from "../../data/mockData";
import { fetchTravelTimeMatrix, hasMapboxToken, hasStreetNumber, isInsideAmba, searchAddresses } from "../../services/mapbox";
import { createTrackingUrl, customerMessage, openWhatsApp, shareTracking } from "../../utils/customerCommunication";
import { registerTracking } from "../../services/tracking";
import { useGeolocation } from "../../hooks/useGeolocation";
import { normalizeAddress, parseDeliveryCsv } from "../../utils/csvImport";
import { loadRecentAddresses, rememberAddress } from "../../utils/recentAddresses";

export function RoutePlanner({ onStartNavigation, onBack }) {
  const { currentRouteId, routeMeta, setRouteMeta, saveCurrentRoute, startCurrentRoute, stops, selectedId, setSelectedId, sortMode, setSortMode, updateStop, removeStop, duplicateStop, addStop, addStops, moveStop, optimizeFromOrigin, routeData, routeStatus } = useRoute();
  const { position, error: locationError, status: locationStatus } = useGeolocation(true);
  const metrics = useRouteMetrics(stops, routeData);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileView, setMobileView] = useState("stops");
  const [isListening, setIsListening] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const dragIndex = useRef(null);
  const recognitionRef = useRef(null);
  const voiceFeedbackTimer = useRef(null);
  const lastAutoOptimizedCount = useRef(0);
  const importInputRef = useRef(null);
  const searchProximity = position?.coordinates?.map((value) => Number(value.toFixed(3))).join(",") || "";

  useEffect(() => () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    clearTimeout(voiceFeedbackTimer.current);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (query.trim().length < 3 || !hasStreetNumber(query)) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const results = hasMapboxToken ? await searchAddresses(query, { signal: controller.signal, proximity: searchProximity ? searchProximity.split(",").map(Number) : undefined }) : demoSuggestions.filter((item) => item.address.toLowerCase().includes(query.toLowerCase()) || query.length >= 3);
        setSuggestions(results);
      } catch (error) { if (error.name !== "AbortError") { setSuggestions([]); setNotice(error.message); } }
    }, 260);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, searchProximity]);

  const chooseSuggestion = (place) => {
    if (stops.some((stop) => normalizeAddress(stop.address) === normalizeAddress(place.address))) { setNotice("Esa dirección ya está incluida en la ruta."); return; }
    addStop(place); rememberAddress(place); setQuery(""); setSuggestions([]); setSearchOpen(false);
  };
  const showRecent = () => { setSearchOpen(true); if (!query) setSuggestions(loadRecentAddresses().filter((place) => hasStreetNumber(place.address) && isInsideAmba(place.coordinates))); };
  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const rows = parseDeliveryCsv(await file.text());
      if (!rows.length) throw new Error("El CSV no contiene filas válidas. Usá una columna llamada Dirección.");
      const capacity = Math.max(0, 24 - stops.length);
      if (!capacity) throw new Error("La ruta ya alcanzó el máximo de 24 paradas.");
      const known = new Set(stops.map((stop) => normalizeAddress(stop.address)));
      const resolved = [];
      let skipped = 0;
      for (const row of rows.slice(0, capacity)) {
        if (!hasStreetNumber(row.address)) { skipped += 1; continue; }
        if (known.has(normalizeAddress(row.address))) { skipped += 1; continue; }
        let place = Number.isFinite(row.longitude) && Number.isFinite(row.latitude) && row.longitude !== 0 && row.latitude !== 0
          ? (isInsideAmba([row.longitude, row.latitude]) ? { address: row.address, coordinates: [row.longitude, row.latitude] } : null)
          : (await searchAddresses(row.address, { proximity: searchProximity ? searchProximity.split(",").map(Number) : undefined }))[0];
        if (!place) { skipped += 1; continue; }
        known.add(normalizeAddress(place.address));
        resolved.push({ ...place, client: row.client, phone: row.phone, schedule: row.schedule, notes: row.notes, priority: row.priority });
      }
      addStops(resolved);
      setNotice(`${resolved.length} paradas importadas${skipped ? ` · ${skipped} omitidas por duplicadas o sin coincidencia` : ""}${rows.length > capacity ? ` · máximo ${capacity} para esta ruta` : ""}.`);
    } catch (error) { setNotice(error.message); }
  };
  const requestStart = async () => {
    if (!hasMapboxToken) { setNotice("Configurá VITE_MAPBOX_ACCESS_TOKEN para iniciar navegación real."); return; }
    if (position?.coordinates && stops.length > 1) await optimizeFromCurrentLocation({ silent: true });
    saveCurrentRoute();
    setStartOpen(true);
  };
  const confirmStart = () => { startCurrentRoute(); setStartOpen(false); onStartNavigation(); };
  const optimizeFromCurrentLocation = async ({ silent = false } = {}) => {
    if (!position?.coordinates) { setNotice(locationError || "Todavía estamos obteniendo tu ubicación."); return; }
    setOptimizing(true);
    try {
      const matrix = hasMapboxToken && stops.length
        ? await fetchTravelTimeMatrix(stops, { origin: position.coordinates })
        : null;
      optimizeFromOrigin(position.coordinates, matrix?.durations);
      if (!silent) setNotice(matrix?.profile === "driving-traffic"
        ? "Paradas optimizadas por tiempo real de conducción y tránsito."
        : matrix ? "Paradas optimizadas por tiempo de conducción. Para más de 9 paradas Mapbox usa tránsito promedio."
          : "Paradas ordenadas desde tu ubicación, considerando distancia, prioridad y horario.");
    } catch (error) {
      optimizeFromOrigin(position.coordinates);
      if (!silent) setNotice(`${error.message} Usamos distancia como alternativa.`);
    } finally { setOptimizing(false); }
  };

  useEffect(() => {
    if (!stops.length) { lastAutoOptimizedCount.current = 0; return; }
    if (!position?.coordinates || lastAutoOptimizedCount.current === stops.length) return;
    lastAutoOptimizedCount.current = stops.length;
    optimizeFromOrigin(position.coordinates);
  }, [optimizeFromOrigin, position?.coordinates, stops.length]);

  const contactCustomer = async (stop, type, channel) => {
    const route = { id: currentRouteId, ...routeMeta };
    let registration = null;
    try { registration = await registerTracking(route, stop); }
    catch (error) { setNotice(error.message); return; }
    const trackingUrl = createTrackingUrl(route, stop, registration?.publicToken);
    const message = customerMessage(type, route, stop, trackingUrl);
    if (channel === "whatsapp") {
      if (!openWhatsApp(stop.phone, message)) setNotice("Agregá un teléfono válido para contactar al cliente.");
      else updateStop(stop.id, { lastNotificationAt: new Date().toISOString() });
      return;
    }
    const result = await shareTracking(message, trackingUrl);
    if (result === "copied") setNotice("Enlace de seguimiento copiado.");
    if (result === "unavailable") setNotice("No pudimos compartir el enlace en este dispositivo.");
    if (result === "shared" || result === "copied") updateStop(stop.id, { lastNotificationAt: new Date().toISOString() });
  };

  const toggleVoiceSearch = () => {
    if (isListening) {
      setVoiceFeedback("Buscando la dirección…");
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice("La búsqueda por voz no está disponible en este navegador. Podés usar Chrome, Edge o el teclado del celular.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-AR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setIsListening(true);
      setSearchOpen(true);
      setVoiceFeedback("Decí calle, altura y localidad");
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || []).map((result) => result?.[0]?.transcript || "").join(" ").trim();
      if (transcript) {
        setQuery(transcript);
        setSearchOpen(true);
        setVoiceFeedback(event.results[event.results.length - 1]?.isFinal ? `Escuché: “${transcript}”` : `Escuchando: “${transcript}”`);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      const messages = {
        "not-allowed": "Necesito permiso para usar el micrófono. Habilitalo en el navegador e intentá nuevamente.",
        "service-not-allowed": "El navegador bloqueó el reconocimiento de voz. Revisá el permiso del micrófono.",
        "audio-capture": "No pude acceder al micrófono del dispositivo.",
        "no-speech": "No escuché ninguna dirección. Tocá el micrófono y volvé a intentarlo.",
        network: "No se pudo procesar la voz por un problema de conexión.",
      };
      setNotice(messages[event.error] || "No pude reconocer la dirección. Volvé a intentarlo.");
      setVoiceFeedback("");
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      clearTimeout(voiceFeedbackTimer.current);
      voiceFeedbackTimer.current = setTimeout(() => setVoiceFeedback(""), 2400);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setNotice("No pude iniciar el micrófono. Esperá un momento y volvé a intentarlo.");
    }
  };

  return (
    <motion.main className={`app-shell mobile-mode-${mobileView}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <aside className="workspace-panel">
        <header className="panel-header">
          <Logo />
        </header>

        <div className="route-heading">
          <button className="icon-button" aria-label="Volver" onClick={onBack}><ChevronLeft size={18}/></button>
          <div className="min-w-0 flex-1"><div className="eyebrow"><span className="status-dot"/> Ruta en preparación</div><input className="route-name-input" aria-label="Nombre de la ruta" value={routeMeta.name} onChange={(event) => setRouteMeta((current) => ({ ...current, name: event.target.value }))}/></div>
          <button className="save-button" onClick={() => { saveCurrentRoute(); setSaved(true); setTimeout(() => setSaved(false), 1800); }}>{saved ? <><Check size={14}/> Guardada</> : "Guardar"}</button>
        </div>

        <section className="route-strip" aria-label="Resumen del trayecto">
          <div><span>Distancia</span><strong>{metrics.distance.toFixed(1)} <small>km</small></strong></div>
          <div><span>En ruta</span><strong>{metrics.minutes} <small>min</small></strong></div>
          <div><span>Llegada</span><strong>{metrics.eta}</strong></div>
          <div className={`calculation-state state-${routeStatus}`}><Route size={14}/>{routeStatus === "loading" ? "Calculando" : routeStatus === "error" ? "Sin conexión" : "Actualizada"}</div>
        </section>

        <div className={`search-zone ${voiceFeedback ? "voice-active" : ""}`}>
          <div className={`address-search ${searchOpen ? "address-search-open" : ""}`}>
            <Search size={17}/><input value={query} onFocus={showRecent} onChange={(event) => { recognitionRef.current?.abort(); setQuery(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" && suggestions[0]) { event.preventDefault(); chooseSuggestion(suggestions[0]); } if (event.key === "Escape") setSearchOpen(false); }} placeholder={isListening ? "Escuchando dirección…" : "Calle y altura en CABA o AMBA"} aria-label="Buscar una dirección"/>
            <button type="button" className={`voice-search-button ${isListening ? "listening" : ""}`} onClick={toggleVoiceSearch} aria-label={isListening ? "Detener búsqueda por voz" : "Buscar dirección por voz"} aria-pressed={isListening} title={isListening ? "Detener escucha" : "Buscar por voz"}>{isListening ? <MicOff size={16}/> : <Mic size={16}/>}</button>
            {query && <button type="button" onClick={() => { recognitionRef.current?.abort(); setQuery(""); setSearchOpen(false); }} aria-label="Limpiar búsqueda"><X size={15}/></button>}
          </div>
          <div className="search-scope"><MapPin size={12}/> CABA + AMBA · calle y altura obligatorias {searchProximity ? "· más cercanos primero" : ""}</div>
          <AnimatePresence>{voiceFeedback && <motion.div className={`voice-feedback ${isListening ? "is-listening" : ""}`} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} aria-live="polite"><span className="voice-bars" aria-hidden="true"><i/><i/><i/><i/></span><span>{voiceFeedback}</span></motion.div>}</AnimatePresence>
          <AnimatePresence>{searchOpen && (query.length >= 3 || (!query && suggestions.length > 0)) && <motion.div className="suggestions" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {suggestions.length ? suggestions.map((place, index) => <button key={place.id || place.address} onClick={() => chooseSuggestion(place)}><span className="suggestion-pin"><MapPin size={14}/></span><span><strong>{place.address.split(",")[0]}</strong><small>{place.address.split(",").slice(1).join(",") || place.area}</small></span>{index === 0 && <kbd>↵</kbd>}</button>) : <div className="search-empty"><CircleAlert size={16}/> {hasStreetNumber(query) ? "No encontramos ese domicilio en CABA o AMBA. Revisá la calle, altura y localidad." : "Agregá la altura. Ejemplo: Av. Santa Fe 3253, CABA."}</div>}
          </motion.div>}</AnimatePresence>
        </div>

        <div className="stops-toolbar"><div><strong>{stops.length} paradas</strong><span> · {stops.filter((stop) => stop.status === "pendiente").length} pendientes</span></div><div className="stop-sort-actions"><button disabled={optimizing} className={locationStatus === "ready" ? "location-ready" : ""} onClick={() => optimizeFromCurrentLocation()} title={locationError || "Optimizar desde mi ubicación"}><LocateFixed size={14}/>{optimizing ? "Optimizando…" : locationStatus === "requesting" ? "Localizando…" : "Desde aquí"}</button><button className={sortMode === "priority" ? "active" : ""} onClick={() => setSortMode(sortMode === "priority" ? "manual" : "priority")}><ArrowDownUp size={14}/>{sortMode === "priority" ? "Por prioridad" : "Prioridad"}</button></div></div>

        <div className="stops-scroll">
          <div className="route-thread" />
          {stops.map((stop, index) => { const legIndex = routeData?.originIncluded ? index : index - 1; const leg = legIndex >= 0 ? routeData?.legs?.[legIndex] : null; const displayStop = leg ? { ...stop, distance: leg.distance / 1000, minutes: Math.round(leg.duration / 60) } : stop; return <StopCard key={stop.id} stop={displayStop} index={index} total={stops.length} selected={stop.id === selectedId} searchProximity={searchProximity} onSelect={() => setSelectedId(stop.id)} onUpdate={(changes) => updateStop(stop.id, changes)} onRemove={() => removeStop(stop.id)} onDuplicate={() => duplicateStop(stop.id)} onMove={moveStop} onContact={(type, channel) => contactCustomer(stop, type, channel)} onDragStart={() => { dragIndex.current = index; }} onDrop={() => { if (dragIndex.current !== null) moveStop(dragIndex.current, index); dragIndex.current = null; }}/>; }) }
          <div className="planner-import-actions"><button className="add-stop-button" onClick={() => { setSearchOpen(true); document.querySelector('.address-search input')?.focus(); }}><Plus size={15}/> Agregar otra parada</button><button className="import-stops-button" onClick={() => importInputRef.current?.click()}><Upload size={15}/> Importar CSV</button><a className="import-template-link" href="/plantilla-entregas.csv" download>Plantilla</a><input ref={importInputRef} type="file" accept=".csv,text/csv" hidden onChange={importCsv}/></div>
        </div>

        <footer className="planner-footer">
          <div className="driver-chip"><div className="driver-photo">{routeMeta.driver?.split(" ").map((part) => part[0]).join("").slice(0, 2) || "—"}</div><span><small>Conductor</small><strong>{routeMeta.driver || "Sin asignar"} · {routeMeta.vehicle || "Sin vehículo"}</strong></span></div>
          <button className="start-button" disabled={!stops.length} onClick={requestStart}><span>Iniciar recorrido</span><Sparkles size={16}/></button>
        </footer>
      </aside>

      <section className="map-stage">
        <RouteMap stops={stops} selectedId={selectedId} onSelect={setSelectedId} routeData={routeData} currentPosition={position}/>
        <div className="map-topbar"><div className="date-pill"><CalendarDays size={15}/><span>{clock.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" })}</span><b>{clock.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</b></div><div className="live-pill"><span/> {locationStatus === "ready" ? `Ubicación ±${Math.round(position.accuracy)} m` : "Buscando ubicación"}</div></div>
        <div className="map-legend"><span><i className="bg-cyan"/> Trayecto activo</span><span><i className="bg-slate-900"/> Parada seleccionada</span><span className="font-mono text-[10px] text-slate-400">© Mapbox</span></div>
      </section>
      <nav className="mobile-view-switch" aria-label="Vista del planificador"><button className={mobileView === "stops" ? "active" : ""} onClick={() => setMobileView("stops")}><List size={17}/><span>Paradas</span></button><button className={mobileView === "map" ? "active" : ""} onClick={() => setMobileView("map")}><MapIcon size={17}/><span>Mapa</span></button></nav>
      {mobileView === "map" && <div className="mobile-map-summary"><div><span>Trayecto</span><strong>{metrics.distance.toFixed(1)} km · {metrics.minutes} min</strong><small>Llegada estimada {metrics.eta}</small></div><button disabled={!stops.length} onClick={requestStart}><Sparkles size={16}/> Iniciar</button></div>}
      <AnimatePresence>{notice && <motion.div className="app-toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><CircleAlert size={16}/><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Cerrar"><X size={14}/></button></motion.div>}</AnimatePresence>
      {startOpen && <StartRouteDialog route={{ id: currentRouteId, ...routeMeta }} stops={stops} onClose={() => setStartOpen(false)} onStart={confirmStart} onUpdateStop={updateStop}/>} 
    </motion.main>
  );
}
