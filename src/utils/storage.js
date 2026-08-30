const STORAGE_KEY = "llegue.routes.v1";
const LEGACY_STORAGE_KEY = "nube.routes.v1";

export function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.routes?.length ? parsed : null;
  } catch {
    return null;
  }
}

export function saveWorkspace(workspace) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function subscribeWorkspace(listener) {
  const handleStorage = (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try { listener(JSON.parse(event.newValue)); } catch { /* Ignorar datos externos inválidos. */ }
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
