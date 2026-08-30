import { useEffect, useRef, useState } from "react";
import { Compass, Crosshair, Layers3, Maximize2, Minus, Plus, Satellite } from "lucide-react";
import { hasMapboxToken, mapboxToken } from "../../services/mapbox";

let mapboxLoader;
function loadMapbox() {
  mapboxLoader ||= import("mapbox-gl").then((module) => module.default);
  return mapboxLoader;
}

const demoPoints = [
  [18, 27], [39, 43], [57, 29], [76, 57],
];

function MapButton({ label, children, active, onClick }) {
  return <button className={`map-tool ${active ? "map-tool-active" : ""}`} onClick={onClick} aria-label={label} title={label}>{children}</button>;
}

export function RouteMap({ stops, selectedId, onSelect, routeData, navigation = false, currentPosition = null, followUser = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxModuleRef = useRef(null);
  const markersRef = useRef(new Map());
  const userMarkerRef = useRef(null);
  const fittedStopsRef = useRef("");
  const [satellite, setSatellite] = useState(false);
  const [traffic, setTraffic] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    if (!hasMapboxToken || !containerRef.current || mapRef.current) return;
    let active = true;
    setMapError("");
    loadMapbox().then((mapboxgl) => {
      if (!active || !containerRef.current) return;
      mapboxModuleRef.current = mapboxgl;
      mapboxgl.accessToken = mapboxToken;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: satellite ? "mapbox://styles/mapbox/satellite-streets-v12" : "mapbox://styles/mapbox/standard",
        center: [-58.418, -34.59],
        zoom: navigation ? 15.2 : 12.2,
        pitch: navigation ? 58 : 22,
        bearing: navigation ? -18 : 0,
        attributionControl: false,
      });
      mapRef.current = map;
      map.once("load", () => { if (active) setMapReady(true); });
      map.on("error", (event) => {
        if (!active) return;
        const message = event?.error?.message || "Mapbox no pudo cargar el mapa.";
        if (/401|403|token|access/i.test(message)) setMapError("Mapbox rechazó el token. Revisá que sea público y esté habilitado para este dominio.");
      });
    }).catch(() => {
      if (active) setMapError("No se pudo descargar Mapbox GL JS. Revisá la conexión e intentá nuevamente.");
    });
    return () => {
      active = false;
      setMapReady(false);
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [navigation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    setMapReady(false);
    map.setStyle(satellite ? "mapbox://styles/mapbox/satellite-streets-v12" : "mapbox://styles/mapbox/standard");
    map.once("style.load", () => setMapReady(true));
  }, [satellite]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxModuleRef.current;
    if (!map || !mapboxgl || !mapReady) return;
    const activeIds = new Set(stops.map((stop) => stop.id));
    markersRef.current.forEach(({ marker }, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });
    stops.forEach((stop, index) => {
      let entry = markersRef.current.get(stop.id);
      if (!entry) {
        const node = document.createElement("button");
        node.className = "mapbox-stop";
        const marker = new mapboxgl.Marker({ element: node, anchor: "center" }).setLngLat(stop.coordinates).addTo(map);
        entry = { marker, node };
        markersRef.current.set(stop.id, entry);
      }
      const completed = stop.status === "completada";
      const failed = stop.status === "no_entregada";
      entry.node.classList.toggle("completed", completed);
      entry.node.classList.toggle("failed", failed);
      entry.node.textContent = completed ? "✓" : failed ? "×" : String(index + 1);
      entry.node.setAttribute("aria-label", completed ? `Parada ${index + 1} completada` : failed ? `Parada ${index + 1} no entregada` : `Seleccionar parada ${index + 1}`);
      entry.node.onclick = () => onSelect(stop.id);
      const position = entry.marker.getLngLat();
      if (position.lng !== stop.coordinates[0] || position.lat !== stop.coordinates[1]) entry.marker.setLngLat(stop.coordinates);
    });
  }, [mapReady, onSelect, stops]);

  useEffect(() => {
    markersRef.current.forEach(({ node }, id) => node.classList.toggle("selected", id === selectedId));
  }, [mapReady, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("active-route");
    const data = routeData?.geometry
      ? { type: "Feature", properties: {}, geometry: routeData.geometry }
      : { type: "FeatureCollection", features: [] };
    if (source) source.setData(data);
    else if (routeData?.geometry) {
      map.addSource("active-route", { type: "geojson", data });
      map.addLayer({ id: "route-casing", type: "line", source: "active-route", paint: { "line-color": "#fff", "line-width": 9, "line-opacity": .92 } });
      map.addLayer({ id: "route-line", type: "line", source: "active-route", paint: { "line-color": "#1596a8", "line-width": 5 } });
    }
  }, [mapReady, routeData]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxModuleRef.current;
    if (!mapReady || !map || !mapboxgl || navigation || !stops.length) return;
    const stopsKey = `${stops.map((stop) => stop.coordinates.join(",")).join("|")}|${currentPosition?.coordinates?.join(",") || ""}`;
    if (stopsKey === fittedStopsRef.current) return;
    fittedStopsRef.current = stopsKey;
    const bounds = new mapboxgl.LngLatBounds();
    stops.forEach((stop) => bounds.extend(stop.coordinates));
    if (currentPosition?.coordinates) bounds.extend(currentPosition.coordinates);
    if (stops.length === 1 && !currentPosition?.coordinates) map.easeTo({ center: stops[0].coordinates, zoom: 14, duration: 550 });
    else map.fitBounds(bounds, { padding: 72, maxZoom: 14.5, duration: 650 });
  }, [currentPosition?.coordinates, mapReady, navigation, stops]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxModuleRef.current;
    if (!mapReady || !map || !mapboxgl || !currentPosition?.coordinates) return;
    if (!userMarkerRef.current) {
      const node = document.createElement("div");
      node.className = "live-vehicle";
      node.innerHTML = "<span></span>";
      userMarkerRef.current = new mapboxgl.Marker({ element: node, rotationAlignment: "map" }).setLngLat(currentPosition.coordinates).addTo(map);
    } else userMarkerRef.current.setLngLat(currentPosition.coordinates);
    if (followUser) map.easeTo({ center: currentPosition.coordinates, zoom: 16.2, pitch: 58, bearing: Number.isFinite(currentPosition.heading) ? currentPosition.heading : map.getBearing(), duration: 650 });
  }, [currentPosition, followUser, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const layerId = "live-traffic";
    const sourceId = "live-traffic-source";
    if (!traffic) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }
    if (!map.getSource(sourceId)) map.addSource(sourceId, { type: "vector", url: "mapbox://mapbox.mapbox-traffic-v1" });
    if (!map.getLayer(layerId)) map.addLayer({ id: layerId, type: "line", source: sourceId, "source-layer": "traffic", minzoom: 6, paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 16, 4], "line-color": ["match", ["get", "congestion"], "low", "#62b77b", "moderate", "#efb341", "heavy", "#e9783c", "severe", "#c83e39", "#819099"], "line-opacity": .72 } }, map.getLayer("route-casing") ? "route-casing" : undefined);
  }, [mapReady, traffic]);

  const selectedIndex = Math.max(0, stops.findIndex((stop) => stop.id === selectedId));
  return (
    <div className={`route-map ${navigation ? "route-map-navigation" : ""}`}>
      {hasMapboxToken ? <div ref={containerRef} className="absolute inset-0" /> : (
        <div className="demo-map" aria-label="Mapa de demostración de Buenos Aires">
          <div className="map-neighborhood n1">PALERMO</div><div className="map-neighborhood n2">RECOLETA</div><div className="map-neighborhood n3">ALMAGRO</div><div className="map-neighborhood n4">RETIRO</div>
          <svg viewBox="0 0 100 72" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            <path className="map-water" d="M82,-2 C76,18 91,23 84,43 C78,57 91,68 88,76 L104,76 L104,-2Z" />
            <g className="map-streets"><path d="M-4 14L87 61M4 61L86 8M16 -2L25 75M45 -2L51 75M68 -2L70 75"/><path d="M-3 29L89 21M-3 46L89 40M-3 63L89 57" /></g>
            <path className="route-shadow" d="M18 27 C27 24,31 45,39 43 S50 25,57 29 S63 51,76 57" />
            <path className="route-line" d="M18 27 C27 24,31 45,39 43 S50 25,57 29 S63 51,76 57" />
            {navigation && <path className="route-traveled" d="M18 27 C27 24,31 45,39 43" />}
          </svg>
          {demoPoints.slice(0, stops.length).map(([x, y], index) => { const stop = stops[index]; const completed = stop.status === "completada"; const failed = stop.status === "no_entregada"; return <button key={stop.id || index} className={`demo-marker ${index === selectedIndex ? "selected" : ""} ${completed ? "completed" : ""} ${failed ? "failed" : ""}`} style={{ left: `${x}%`, top: `${y / .72}%` }} onClick={() => onSelect(stop.id)} aria-label={completed ? `Parada ${index + 1} completada` : failed ? `Parada ${index + 1} no entregada` : `Parada ${index + 1}`}>{completed ? "✓" : failed ? "×" : index + 1}</button>; })}
          {navigation && <div className="vehicle-marker" style={{ left: "39%", top: "60%" }}><span /></div>}
          <div className="demo-badge"><span className="h-2 w-2 rounded-full bg-signal" /> Modo demo · conectá Mapbox</div>
        </div>
      )}
      {mapError && <div className="map-error" role="alert">{mapError}</div>}
      {!navigation && <div className="absolute right-5 top-5 flex flex-col gap-2">
        <div className="map-tool-stack"><MapButton label="Acercar" onClick={() => mapRef.current?.zoomIn()}><Plus size={17}/></MapButton><MapButton label="Alejar" onClick={() => mapRef.current?.zoomOut()}><Minus size={17}/></MapButton></div>
        <MapButton label="Centrar ubicación" onClick={() => currentPosition?.coordinates && mapRef.current?.easeTo({ center: currentPosition.coordinates, zoom: 15, duration: 600 })}><Crosshair size={17}/></MapButton>
        <MapButton label="Brújula" onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 500 })}><Compass size={17}/></MapButton>
        <MapButton label="Vista satélite" active={satellite} onClick={() => setSatellite((value) => !value)}><Satellite size={17}/></MapButton>
        <MapButton label="Tráfico" active={traffic} onClick={() => setTraffic((value) => !value)}><Layers3 size={17}/></MapButton>
        <MapButton label="Pantalla completa" onClick={() => document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.parentElement?.requestFullscreen()}><Maximize2 size={17}/></MapButton>
      </div>}
    </div>
  );
}
