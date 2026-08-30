const KEY = "llegue.recent-addresses";

export function loadRecentAddresses() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]").filter((item) => item?.address && item?.coordinates?.length === 2).slice(0, 5); }
  catch { return []; }
}

export function rememberAddress(place) {
  try {
    const current = loadRecentAddresses().filter((item) => item.address !== place.address);
    localStorage.setItem(KEY, JSON.stringify([{ ...place, id: place.id || `recent-${Date.now()}` }, ...current].slice(0, 5)));
  } catch { /* El almacenamiento puede no estar disponible. */ }
}
