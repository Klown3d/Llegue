import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initialStops } from "../data/mockData";
import { loadWorkspace, saveWorkspace } from "../utils/storage";
import { loadCloudWorkspace, saveCloudWorkspace } from "../services/workspace";
import { useAuth } from "./AuthContext";
import { optimizeStopsFromOrigin, optimizeStopsFromTravelMatrix } from "../utils/routeOptimization";

const RouteContext = createContext(null);
const priorityWeight = { alta: 0, media: 1, baja: 2 };
const emptyRuntimeStats = () => ({ distanceMeters: 0, durationSeconds: 0, incidents: [] });

function buildSeedRoute() {
  return {
    id: "route-demo", name: "Centro · Viernes AM", driver: "Lucía Sosa", vehicle: "AE 314 TK",
    date: new Date().toISOString().slice(0, 10), notes: "Entregas del turno mañana.", status: "borrador",
    stops: initialStops, manualOrder: initialStops.map((stop) => stop.id), sortMode: "manual",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stats: null,
  };
}

const bootstrap = typeof window !== "undefined" ? loadWorkspace() : null;
const initialRoutes = bootstrap?.routes || [buildSeedRoute()];
const initialRouteId = bootstrap?.currentRouteId || initialRoutes[0].id;
const seedCurrent = initialRoutes.find((route) => route.id === initialRouteId) || initialRoutes[0];

export function RouteProvider({ children }) {
  const { session } = useAuth();
  const [routes, setRoutes] = useState(initialRoutes);
  const [currentRouteId, setCurrentRouteId] = useState(seedCurrent.id);
  const [routeMeta, setRouteMeta] = useState({ name: seedCurrent.name, driver: seedCurrent.driver, vehicle: seedCurrent.vehicle, date: seedCurrent.date, notes: seedCurrent.notes, returnToOrigin: Boolean(seedCurrent.returnToOrigin) });
  const [stops, setStops] = useState(seedCurrent.stops || []);
  const [selectedId, setSelectedId] = useState(seedCurrent.stops?.[0]?.id || null);
  const [manualOrder, setManualOrder] = useState(seedCurrent.manualOrder || seedCurrent.stops?.map((stop) => stop.id) || []);
  const [sortMode, setSortMode] = useState(seedCurrent.sortMode || "manual");
  const [routeData, setRouteData] = useState(null);
  const [routeStatus, setRouteStatus] = useState("idle");
  const [routeOrigin, setRouteOrigin] = useState(null);
  const [runtimeStats, setRuntimeStats] = useState(seedCurrent.runtimeStats || emptyRuntimeStats());
  const [cloudSyncStatus, setCloudSyncStatus] = useState("loading");
  const [cloudSyncError, setCloudSyncError] = useState("");
  const [cloudReady, setCloudReady] = useState(false);
  const cloudVersion = useRef(0);
  const lastCloudPayload = useRef("");

  const replaceWorkspace = useCallback((workspace) => {
    if (!workspace?.routes?.length) return false;
    const nextRouteId = workspace.routes.some((route) => route.id === workspace.currentRouteId) ? workspace.currentRouteId : workspace.routes[0].id;
    const route = workspace.routes.find((item) => item.id === nextRouteId) || workspace.routes[0];
    setRoutes(workspace.routes);
    setCurrentRouteId(nextRouteId);
    setRouteMeta({ name: route.name, driver: route.driver, vehicle: route.vehicle, date: route.date, notes: route.notes || "", returnToOrigin: Boolean(route.returnToOrigin) });
    setStops(route.stops || []);
    setManualOrder(route.manualOrder || route.stops?.map((stop) => stop.id) || []);
    setSortMode(route.sortMode || "manual");
    setSelectedId(route.stops?.[0]?.id || null);
    setRouteData(null);
    setRouteOrigin(null);
    setRuntimeStats(route.runtimeStats || emptyRuntimeStats());
    return true;
  }, []);

  const orderedStops = useMemo(() => sortMode === "priority"
    ? [...stops].sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority])
    : manualOrder.map((id) => stops.find((stop) => stop.id === id)).filter(Boolean), [manualOrder, sortMode, stops]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setRoutes((current) => current.map((route) => route.id === currentRouteId ? {
        ...route, ...routeMeta, stops, manualOrder, sortMode, runtimeStats, updatedAt: new Date().toISOString(),
      } : route));
    }, 180);
    return () => clearTimeout(timer);
  }, [currentRouteId, manualOrder, routeMeta, runtimeStats, sortMode, stops]);
  useEffect(() => { saveWorkspace({ routes, currentRouteId }); }, [currentRouteId, routes]);

  useEffect(() => {
    if (!routeData?.geometry?.coordinates?.length) return;
    setRoutes((current) => current.map((route) => route.id === currentRouteId
      ? { ...route, cachedRouteData: routeData }
      : route.status === "en_curso" ? route : { ...route, cachedRouteData: null }));
  }, [currentRouteId, routeData]);

  useEffect(() => {
    let cancelled = false;
    const accessToken = session?.access_token;
    if (!accessToken) { setCloudSyncStatus("offline"); return undefined; }
    setCloudReady(false);
    setCloudSyncStatus("loading");
    setCloudSyncError("");
    const localWorkspace = { routes, currentRouteId };
    loadCloudWorkspace(accessToken).then(async (remote) => {
      if (cancelled) return;
      if (remote?.payload?.routes?.length) {
        cloudVersion.current = Number(remote.version || 0);
        lastCloudPayload.current = JSON.stringify(remote.payload);
        replaceWorkspace(remote.payload);
      } else {
        const created = await saveCloudWorkspace(accessToken, localWorkspace, 0);
        if (cancelled) return;
        cloudVersion.current = Number(created?.version || 1);
        lastCloudPayload.current = JSON.stringify(localWorkspace);
      }
      setCloudReady(true);
      setCloudSyncStatus("synced");
    }).catch((error) => {
      if (cancelled) return;
      setCloudReady(true);
      setCloudSyncStatus("offline");
      setCloudSyncError(error.message);
    });
    return () => { cancelled = true; };
  }, [session?.access_token, replaceWorkspace]);

  useEffect(() => {
    if (!cloudReady || !session?.access_token) return undefined;
    const workspace = { routes, currentRouteId };
    const serialized = JSON.stringify(workspace);
    if (serialized === lastCloudPayload.current) return undefined;
    setCloudSyncStatus("syncing");
    const timer = setTimeout(async () => {
      try {
        const result = await saveCloudWorkspace(session.access_token, workspace, cloudVersion.current);
        if (result?.conflict && result.current?.payload) {
          cloudVersion.current = Number(result.current.version || cloudVersion.current);
          lastCloudPayload.current = JSON.stringify(result.current.payload);
          replaceWorkspace(result.current.payload);
          setCloudSyncStatus("conflict");
          setCloudSyncError("Se recuperó una versión más reciente guardada en otro dispositivo.");
          return;
        }
        cloudVersion.current = Number(result?.version || cloudVersion.current + 1);
        lastCloudPayload.current = serialized;
        setCloudSyncStatus("synced");
        setCloudSyncError("");
      } catch (error) {
        setCloudSyncStatus("offline");
        setCloudSyncError(error.message);
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [cloudReady, currentRouteId, replaceWorkspace, routes, session?.access_token]);

  const updateStop = useCallback((id, changes) => setStops((current) => current.map((stop) => stop.id === id ? { ...stop, ...changes } : stop)), []);
  const updateRuntimeStats = useCallback((changes) => setRuntimeStats((current) => typeof changes === "function" ? changes(current) : { ...current, ...changes }), []);
  const removeStop = useCallback((id) => { setStops((current) => current.filter((stop) => stop.id !== id)); setManualOrder((current) => current.filter((stopId) => stopId !== id)); setSelectedId((current) => current === id ? null : current); }, []);
  const duplicateStop = useCallback((id) => {
    const source = stops.find((stop) => stop.id === id); if (!source) return;
    const clone = { ...source, id: crypto.randomUUID(), client: `${source.client} · copia`, status: "pendiente" };
    setStops((current) => [...current, clone]); setManualOrder((current) => [...current, clone.id]); setSelectedId(clone.id);
  }, [stops]);
  const addStop = useCallback((place) => {
    const stop = { id: crypto.randomUUID(), address: place.address, shortAddress: place.address.split(",")[0], coordinates: place.coordinates, client: place.client || "Nuevo destinatario", phone: place.phone || "Sin teléfono", schedule: place.schedule || "Horario abierto", notes: place.notes || "", priority: ["alta", "media", "baja"].includes(place.priority) ? place.priority : "media", status: "pendiente", distance: 0, minutes: 0 };
    setStops((current) => [...current, stop]); setManualOrder((current) => [...current, stop.id]); setSelectedId(stop.id);
  }, []);
  const addStops = useCallback((places) => {
    const nextStops = places.map((place) => ({ id: crypto.randomUUID(), address: place.address, shortAddress: place.address.split(",")[0], coordinates: place.coordinates, client: place.client || "Nuevo destinatario", phone: place.phone || "Sin teléfono", schedule: place.schedule || "Horario abierto", notes: place.notes || "", priority: ["alta", "media", "baja"].includes(place.priority) ? place.priority : "media", status: "pendiente", distance: 0, minutes: 0 }));
    setStops((current) => [...current, ...nextStops]);
    setManualOrder((current) => [...current, ...nextStops.map((stop) => stop.id)]);
    if (nextStops.length) setSelectedId(nextStops[0].id);
    return nextStops.length;
  }, []);
  const moveStop = useCallback((fromIndex, toIndex) => { setSortMode("manual"); setManualOrder((current) => { const next = [...current]; const [moved] = next.splice(fromIndex, 1); next.splice(toIndex, 0, moved); return next; }); }, []);
  const optimizeFromOrigin = useCallback((coordinates, travelDurations = null) => {
    if (!coordinates?.length) return false;
    const optimized = travelDurations
      ? optimizeStopsFromTravelMatrix(orderedStops, coordinates, travelDurations)
      : optimizeStopsFromOrigin(orderedStops, coordinates);
    setSortMode("manual");
    setManualOrder(optimized.map((stop) => stop.id));
    setRouteOrigin({ coordinates, updatedAt: new Date().toISOString() });
    return true;
  }, [orderedStops]);

  const saveCurrentRoute = useCallback(() => {
    const snapshot = { ...routeMeta, stops, manualOrder, sortMode, runtimeStats, updatedAt: new Date().toISOString() };
    setRoutes((current) => current.map((route) => route.id === currentRouteId ? { ...route, ...snapshot } : route)); return true;
  }, [currentRouteId, manualOrder, routeMeta, runtimeStats, sortMode, stops]);
  const startCurrentRoute = useCallback(() => {
    const startedAt = new Date().toISOString();
    setRoutes((current) => current.map((route) => route.id === currentRouteId ? {
      ...route, ...routeMeta, stops, manualOrder, sortMode, runtimeStats, status: "en_curso", startCoordinates: routeOrigin?.coordinates || route.startCoordinates || null, startedAt, updatedAt: startedAt,
    } : route));
  }, [currentRouteId, manualOrder, routeMeta, routeOrigin?.coordinates, runtimeStats, sortMode, stops]);
  const openRoute = useCallback((id) => {
    const route = routes.find((item) => item.id === id); if (!route) return false;
    setCurrentRouteId(route.id); setRouteMeta({ name: route.name, driver: route.driver, vehicle: route.vehicle, date: route.date, notes: route.notes || "", returnToOrigin: Boolean(route.returnToOrigin) });
    setStops(route.stops || []); setManualOrder(route.manualOrder || route.stops?.map((stop) => stop.id) || []); setSortMode(route.sortMode || "manual");
    setSelectedId(route.stops?.[0]?.id || null); setRouteData(route.cachedRouteData || null); setRouteOrigin(route.startCoordinates ? { coordinates: route.startCoordinates, updatedAt: route.startedAt } : null); setRuntimeStats(route.runtimeStats || emptyRuntimeStats()); return true;
  }, [routes]);
  const createRoute = useCallback((meta) => {
    const route = { id: crypto.randomUUID(), ...meta, status: "borrador", stops: [], manualOrder: [], sortMode: "manual", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stats: null };
    setRoutes((current) => [route, ...current]); setCurrentRouteId(route.id); setRouteMeta({ name: route.name, driver: route.driver, vehicle: route.vehicle, date: route.date, notes: route.notes || "", returnToOrigin: Boolean(route.returnToOrigin) });
    setStops([]); setManualOrder([]); setSortMode("manual"); setSelectedId(null); setRouteData(null); setRouteOrigin(null); setRuntimeStats(emptyRuntimeStats()); return route.id;
  }, []);
  const finishCurrentRoute = useCallback((stats) => {
    const completedAt = new Date().toISOString();
    setRoutes((current) => current.map((route) => route.id === currentRouteId ? { ...route, ...routeMeta, stops, runtimeStats, cachedRouteData: null, status: "finalizada", stats: { ...stats, completedAt }, updatedAt: completedAt } : route));
  }, [currentRouteId, routeMeta, runtimeStats, stops]);
  const deleteRoute = useCallback((id) => setRoutes((current) => current.filter((route) => route.id !== id)), []);
  const archiveRoute = useCallback((id) => setRoutes((current) => current.map((route) => route.id === id ? { ...route, status: route.status === "archivada" ? "borrador" : "archivada", updatedAt: new Date().toISOString() } : route)), []);
  const duplicateRoute = useCallback((id) => setRoutes((current) => {
    const source = current.find((route) => route.id === id);
    if (!source) return current;
    const idMap = new Map((source.stops || []).map((stop) => [stop.id, crypto.randomUUID()]));
    const clone = { ...source, id: crypto.randomUUID(), name: `${source.name} · copia`, status: "borrador", stats: null, stops: (source.stops || []).map((stop) => ({ ...stop, id: idMap.get(stop.id), status: "pendiente", completedAt: null })), manualOrder: (source.manualOrder || []).map((stopId) => idMap.get(stopId)).filter(Boolean), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    return [clone, ...current];
  }), []);

  const currentRoute = useMemo(() => routes.find((route) => route.id === currentRouteId), [currentRouteId, routes]);
  const value = { routes, currentRoute, currentRouteId, routeMeta, setRouteMeta, stops: orderedStops, selectedId, setSelectedId, sortMode, setSortMode, updateStop, removeStop, duplicateStop, addStop, addStops, moveStop, optimizeFromOrigin, routeOrigin, setRouteOrigin, routeData, setRouteData, routeStatus, setRouteStatus, runtimeStats, updateRuntimeStats, cloudSyncStatus, cloudSyncError, saveCurrentRoute, startCurrentRoute, openRoute, createRoute, finishCurrentRoute, deleteRoute, archiveRoute, duplicateRoute };
  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export function useRoute() { const context = useContext(RouteContext); if (!context) throw new Error("useRoute debe utilizarse dentro de RouteProvider"); return context; }
