import { motion } from "framer-motion";
import { Archive, ArchiveRestore, ArrowRight, CalendarDays, CheckCircle2, Cloud, CloudOff, Clock3, Copy, Download, LogOut, MapPinned, Plus, RefreshCw, Route, Trash2, Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRoute } from "../../contexts/RouteContext";
import { Logo } from "../brand/Logo";
import { useAuth } from "../../contexts/AuthContext";

function CreateRouteDialog({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: "", driver: "", vehicle: "", date: new Date().toISOString().slice(0, 10), notes: "", returnToOrigin: false });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => { event.preventDefault(); if (!form.name.trim() || !form.driver.trim()) return; onCreate(form); };
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <motion.form className="route-dialog" initial={{ opacity: 0, y: 14, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
      <div className="dialog-heading"><div><span>Nueva operación</span><h2>Crear una ruta</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X size={18}/></button></div>
      <label className="dialog-field">Nombre de la ruta<input autoFocus value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ej. Centro · Lunes AM" required/></label>
      <div className="dialog-grid"><label className="dialog-field">Conductor<input value={form.driver} onChange={(event) => update("driver", event.target.value)} placeholder="Nombre y apellido" required/></label><label className="dialog-field">Vehículo<input value={form.vehicle} onChange={(event) => update("vehicle", event.target.value)} placeholder="Patente o unidad"/></label></div>
      <label className="dialog-field">Fecha<input type="date" value={form.date} onChange={(event) => update("date", event.target.value)}/></label>
      <label className="dialog-field">Observaciones<textarea rows="3" value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Indicaciones generales para el recorrido"/></label>
      <label className="dialog-return"><input type="checkbox" checked={form.returnToOrigin} onChange={(event) => update("returnToOrigin", event.target.checked)}/><span>Regresar al punto de partida al finalizar</span></label>
      <div className="dialog-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="submit">Crear ruta <ArrowRight size={15}/></button></div>
    </motion.form>
  </div>;
}

export function Dashboard({ onOpenRoute, onCreateRoute }) {
  const { routes, cloudSyncStatus, cloudSyncError, archiveRoute, duplicateRoute, deleteRoute } = useRoute();
  const { user, signOut } = useAuth();
  const [creating, setCreating] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [filter, setFilter] = useState("today");
  useEffect(() => {
    const capturePrompt = (event) => { event.preventDefault(); setInstallPrompt(event); };
    const installed = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", installed);
    return () => { window.removeEventListener("beforeinstallprompt", capturePrompt); window.removeEventListener("appinstalled", installed); };
  }, []);
  const installApp = async () => { if (!installPrompt) return; await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); };
  const stats = useMemo(() => {
    const operationalRoutes = routes.filter((route) => route.status !== "archivada");
    const stops = operationalRoutes.flatMap((route) => route.stops || []);
    return { active: operationalRoutes.filter((route) => route.status !== "finalizada").length, finished: operationalRoutes.filter((route) => route.status === "finalizada").length, pending: stops.filter((stop) => !["completada", "no_entregada"].includes(stop.status)).length, completed: stops.filter((stop) => stop.status === "completada").length, km: operationalRoutes.reduce((total, route) => total + (route.stats?.distance || 0), 0) };
  }, [routes]);
  const visibleRoutes = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (filter === "archived") return routes.filter((route) => route.status === "archivada");
    if (filter === "today") return routes.filter((route) => route.date === today && route.status !== "archivada");
    return routes.filter((route) => route.status !== "archivada");
  }, [filter, routes]);
  return <motion.main className="dashboard-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <header className="dashboard-topbar"><Logo/><nav><button className="active">Operaciones</button></nav><div className={`cloud-status cloud-${cloudSyncStatus}`} title={cloudSyncError || "Sincronización con Supabase"}>{cloudSyncStatus === "offline" ? <CloudOff size={14}/> : cloudSyncStatus === "syncing" || cloudSyncStatus === "loading" ? <RefreshCw className="spin" size={14}/> : <Cloud size={14}/>}<span>{cloudSyncStatus === "synced" ? "Guardado en la nube" : cloudSyncStatus === "syncing" || cloudSyncStatus === "loading" ? "Sincronizando" : cloudSyncStatus === "conflict" ? "Versión recuperada" : "Copia local"}</span></div>{installPrompt && <button className="install-app" onClick={installApp}><Download size={14}/><span>Instalar</span></button>}<div className="user-menu"><span>{user?.email}</span><button onClick={signOut} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={15}/></button></div></header>
    <div className="dashboard-content">
      <section className="dashboard-intro"><div><span className="eyebrow">Centro de operaciones</span><h1>Rutas de hoy</h1><p>Planificá, despachá y seguí cada entrega desde un solo lugar.</p></div><button className="new-route" onClick={() => setCreating(true)}><Plus size={17}/> Crear ruta</button></section>
      <section className="ops-metrics">
        <div><Route/><span>Rutas activas</span><strong>{stats.active}</strong></div><div><CheckCircle2/><span>Finalizadas</span><strong>{stats.finished}</strong></div><div><Clock3/><span>Entregas pendientes</span><strong>{stats.pending}</strong></div><div><Archive/><span>Completadas</span><strong>{stats.completed}</strong></div><div><MapPinned/><span>Kilómetros</span><strong>{stats.km.toFixed(1)}</strong></div>
      </section>
      <section className="route-board"><div className="board-heading"><div><h2>Operaciones recientes</h2><span>{routes.length} rutas sincronizadas</span></div><button onClick={() => setFilter((current) => current === "today" ? "all" : current === "all" ? "archived" : "today")}><CalendarDays size={14}/>{filter === "today" ? "Hoy" : filter === "all" ? "Todas" : "Archivadas"}</button></div>
        <div className="route-table">
          {visibleRoutes.map((route) => { const completed = route.stops?.filter((stop) => stop.status === "completada").length || 0; const total = route.stops?.length || 0; const statusLabel = route.status === "archivada" ? "Archivada" : route.status === "finalizada" ? "Finalizada" : route.status === "en_curso" ? "En curso" : total ? "En preparación" : "Sin paradas"; return <div key={route.id} className="route-row" role="button" tabIndex="0" onClick={() => onOpenRoute(route.id)} onKeyDown={(event) => { if (event.key === "Enter") onOpenRoute(route.id); }}>
            <span className={`route-state ${route.status === "finalizada" ? "finished" : route.status === "en_curso" ? "in-progress" : ""}`}><Truck size={16}/></span>
            <span className="route-primary"><strong>{route.name}</strong><small>{route.status === "finalizada" ? `${route.stats?.deliveries || 0} entregas · ${(route.stats?.distance || 0).toFixed(1)} km · ${route.stats?.incidents?.length || 0} incidencias` : `${route.driver || "Sin conductor"} · ${route.vehicle || "Sin vehículo"}`}</small></span>
            <span><small>Fecha</small><strong>{new Date(`${route.date}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}</strong></span>
            <span><small>Entregas</small><strong>{completed}/{total}</strong></span>
            <span><small>Estado</small><strong className={route.status === "finalizada" ? "text-emerald-600" : route.status === "en_curso" ? "text-amber-600" : "text-cyan"}>{statusLabel}</strong></span>
            <span className="route-actions"><button title="Duplicar" onClick={(event) => { event.stopPropagation(); duplicateRoute(route.id); }}><Copy size={14}/></button><button title={route.status === "archivada" ? "Recuperar" : "Archivar"} onClick={(event) => { event.stopPropagation(); archiveRoute(route.id); }}>{route.status === "archivada" ? <ArchiveRestore size={14}/> : <Archive size={14}/>}</button><button title="Eliminar" onClick={(event) => { event.stopPropagation(); if (window.confirm(`¿Eliminar ${route.name}?`)) deleteRoute(route.id); }}><Trash2 size={14}/></button><ArrowRight size={16}/></span>
          </div>; })}
          {!visibleRoutes.length && <div className="empty-routes"><Route size={28}/><h3>No hay rutas en esta vista</h3><p>Cambiá el filtro o creá una nueva operación.</p></div>}
        </div>
      </section>
    </div>
    {creating && <CreateRouteDialog onClose={() => setCreating(false)} onCreate={(form) => { onCreateRoute(form); setCreating(false); }}/>} 
  </motion.main>;
}
