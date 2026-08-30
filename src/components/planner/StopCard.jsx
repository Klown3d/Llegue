import { AnimatePresence, motion } from "framer-motion";
import { BellRing, ChevronDown, ChevronUp, Clock3, Copy, GripVertical, MapPin, MessageCircle, MoreHorizontal, Pencil, Phone, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { hasMapboxToken, hasStreetNumber, searchAddresses } from "../../services/mapbox";

const priorityLabels = { alta: "Alta", media: "Media", baja: "Baja" };

export function StopCard({ stop, index, total, selected, searchProximity, onSelect, onUpdate, onRemove, onDuplicate, onMove, onDragStart, onDrop, onContact }) {
  const [open, setOpen] = useState(() => selected && !window.matchMedia("(max-width: 560px)").matches);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addressQuery, setAddressQuery] = useState(stop.address);
  const [addressResults, setAddressResults] = useState([]);
  const [focusAddress, setFocusAddress] = useState(false);
  const addressInputRef = useRef(null);

  useEffect(() => {
    if (!open || !focusAddress) return;
    addressInputRef.current?.focus();
    addressInputRef.current?.select();
    setFocusAddress(false);
  }, [focusAddress, open]);

  useEffect(() => {
    if (!open || !hasMapboxToken || addressQuery === stop.address || addressQuery.trim().length < 3 || !hasStreetNumber(addressQuery)) { setAddressResults([]); return; }
    const controller = new AbortController();
    const proximity = searchProximity ? searchProximity.split(",").map(Number) : undefined;
    const timer = setTimeout(() => searchAddresses(addressQuery, { signal: controller.signal, proximity }).then(setAddressResults).catch(() => setAddressResults([])), 280);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [addressQuery, open, searchProximity, stop.address]);

  const startAddressEdit = (event) => {
    event.stopPropagation();
    setAddressQuery(stop.address);
    setAddressResults([]);
    setOpen(true);
    setFocusAddress(true);
  };

  const applyAddress = (place) => {
    onUpdate({ address: place.address, shortAddress: place.address.split(",")[0], coordinates: place.coordinates });
    setAddressQuery(place.address);
    setAddressResults([]);
  };

  return (
    <motion.article layout draggable onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className={`stop-card ${selected ? "stop-card-selected" : ""}`} onClick={onSelect}>
      <div className="flex items-start gap-3 px-3 py-3.5">
        <button className="mt-1 cursor-grab text-slate-300 hover:text-slate-500" aria-label={`Arrastrar parada ${index + 1}`}><GripVertical size={16} /></button>
        <div className="route-node mt-0.5">{index + 1}</div>
        <button className="stop-summary min-w-0 flex-1 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <div className="flex items-center gap-2">
            <span className="stop-address truncate text-[13px] font-bold text-ink">{stop.shortAddress}</span>
            <span className={`priority priority-${stop.priority}`}>{priorityLabels[stop.priority]}</span>
          </div>
          <div className="stop-meta mt-1 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="truncate">{stop.client}</span><span>·</span><span className="font-mono">{stop.distance.toFixed(1)} km</span><span>·</span><span className="font-mono">{stop.minutes} min</span>
          </div>
        </button>
        <div className="relative flex items-center gap-1">
          <div className="mobile-reorder"><button disabled={index === 0} onClick={(event) => { event.stopPropagation(); onMove(index, index - 1); }} aria-label="Subir parada"><ChevronUp size={15}/></button><button disabled={index === total - 1} onClick={(event) => { event.stopPropagation(); onMove(index, index + 1); }} aria-label="Bajar parada"><ChevronDown size={15}/></button></div>
          <button className="edit-address-trigger" type="button" onClick={startAddressEdit} aria-label={`Modificar dirección de ${stop.shortAddress}`} title="Modificar dirección"><Pencil size={14}/><span>Modificar</span></button>
          <button className="icon-button-small" onClick={(event) => { event.stopPropagation(); setMenuOpen((value) => !value); }} aria-label="Acciones de parada"><MoreHorizontal size={16}/></button>
          <button className="icon-button-small" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }} aria-label={open ? "Contraer parada" : "Expandir parada"}><ChevronDown size={15} className={`transition ${open ? "rotate-180" : ""}`}/></button>
          {menuOpen && <div className="stop-menu" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => { onDuplicate(); setMenuOpen(false); }}><Copy size={14}/> Duplicar</button>
            <button className="text-red-600" onClick={() => onRemove()}><Trash2 size={14}/> Eliminar</button>
          </div>}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
          <div className="border-t border-line px-4 pb-4 pt-3">
            <label className="field-label mb-2">Dirección<div className="stop-address-editor"><input ref={addressInputRef} className="field" value={addressQuery} onChange={(event) => setAddressQuery(event.target.value)} placeholder="Calle y altura, CABA o AMBA"/>{addressQuery !== stop.address && <div className="address-edit-status"><small>{hasStreetNumber(addressQuery) ? "Elegí una coincidencia para actualizar la dirección y el mapa." : "Agregá la altura para buscar el domicilio."}</small><button type="button" onClick={() => { setAddressQuery(stop.address); setAddressResults([]); }}>Cancelar</button></div>}{addressResults.length > 0 && <div className="stop-address-results">{addressResults.map((place) => <button type="button" key={place.id || place.address} onClick={() => applyAddress(place)}>{place.address}</button>)}</div>}</div></label>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="field-label">Prioridad<select value={stop.priority} onChange={(e) => onUpdate({ priority: e.target.value })} className="field"><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label>
              <label className="field-label">Posición<select value={index + 1} onChange={(e) => onMove(index, Number(e.target.value) - 1)} className="field">{Array.from({ length: total }, (_, position) => <option key={position} value={position + 1}>Parada {position + 1}</option>)}</select></label>
            </div>
            <label className="field-label mb-2">Cliente<input className="field" value={stop.client} onChange={(e) => onUpdate({ client: e.target.value })}/></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="field-label"><Phone size={11}/> Teléfono<input className="field" value={stop.phone} onChange={(e) => onUpdate({ phone: e.target.value })}/></label>
              <label className="field-label"><Clock3 size={11}/> Horario<input className="field" value={stop.schedule} onChange={(e) => onUpdate({ schedule: e.target.value })}/></label>
            </div>
            <label className="field-label mt-2"><MapPin size={11}/> Observaciones<textarea rows="2" className="field resize-none" value={stop.notes} onChange={(e) => onUpdate({ notes: e.target.value })}/></label>
            <div className="customer-actions" onClick={(event) => event.stopPropagation()}>
              <a href={`tel:${stop.phone}`}><Phone size={14}/> Llamar</a>
              <button type="button" onClick={() => onContact("scheduled", "whatsapp")}><MessageCircle size={14}/> WhatsApp</button>
              <button type="button" onClick={() => onContact("scheduled", "share")}><BellRing size={14}/> Enviar seguimiento</button>
            </div>
          </div>
        </motion.div>}
      </AnimatePresence>
    </motion.article>
  );
}
