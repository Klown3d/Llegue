import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { RoutePlanner } from "./components/planner/RoutePlanner";
import { NavigationView } from "./components/navigation/NavigationView";
import { Dashboard } from "./components/dashboard/Dashboard";
import { CustomerPortal } from "./components/tracking/CustomerPortal";
import { useRoute } from "./contexts/RouteContext";
import { fetchDirections, hasMapboxToken } from "./services/mapbox";
import { decodeTrackingPayload } from "./utils/customerCommunication";
import { hasTrackingApi } from "./services/tracking";

export default function App() {
  const { routes, stops, routeMeta, routeOrigin, setRouteData, setRouteStatus, openRoute, createRoute, saveCurrentRoute, finishCurrentRoute } = useRoute();
  const [mode, setMode] = useState("dashboard");
  const trackingToken = new URLSearchParams(window.location.search).get("tracking") || "";
  const trackingSnapshot = decodeTrackingPayload(trackingToken);

  const recalculateRoute = useCallback(async (signal) => {
    if (mode !== "planner") return;
    if (!stops.length || (!routeOrigin?.coordinates && stops.length < 2)) { setRouteData(null); return; }
    setRouteStatus("loading");
    if (!hasMapboxToken) {
      const timer = setTimeout(() => setRouteStatus("ready"), 480);
      return () => clearTimeout(timer);
    }
    try {
      const routeStops = routeMeta.returnToOrigin && routeOrigin?.coordinates ? [...stops, { id: "return-to-origin", coordinates: routeOrigin.coordinates }] : stops;
      const route = await fetchDirections(routeStops, { signal, origin: routeOrigin?.coordinates });
      setRouteData(route);
      setRouteStatus("ready");
    } catch (error) {
      if (error.name !== "AbortError") setRouteStatus("error");
    }
  }, [mode, routeMeta.returnToOrigin, routeOrigin?.coordinates, setRouteData, setRouteStatus, stops]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => recalculateRoute(controller.signal), 320);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [recalculateRoute]);

  if (trackingSnapshot || (hasTrackingApi && trackingToken)) return <CustomerPortal snapshot={trackingSnapshot} publicToken={trackingSnapshot ? "" : trackingToken}/>;

  return <AnimatePresence mode="wait">
    {mode === "dashboard" && <Dashboard key="dashboard" onOpenRoute={(id) => { const route = routes.find((item) => item.id === id); openRoute(id); setMode(route?.status === "en_curso" ? "navigation" : "planner"); }} onCreateRoute={(meta) => { createRoute(meta); setMode("planner"); }}/>} 
    {mode === "planner" && <RoutePlanner key="planner" onBack={() => { saveCurrentRoute(); setMode("dashboard"); }} onStartNavigation={() => setMode("navigation")}/>} 
    {mode === "navigation" && <NavigationView key="navigation" onFinish={(stats) => { finishCurrentRoute(stats); setMode("dashboard"); }}/>} 
  </AnimatePresence>;
}
