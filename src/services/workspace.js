const API_BASE = String(import.meta.env.VITE_TRACKING_API_BASE || "").replace(/\/$/, "");

async function requestWorkspace(accessToken, options = {}) {
  const response = await fetch(`${API_BASE}/workspace`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 404) return null;
  if (response.status === 409) return { conflict: true, current: payload.current };
  if (!response.ok) throw new Error(payload.message || `La sincronización respondió ${response.status}.`);
  return payload;
}

export function loadCloudWorkspace(accessToken) {
  return requestWorkspace(accessToken, { method: "GET" });
}

export function saveCloudWorkspace(accessToken, workspace, expectedVersion) {
  return requestWorkspace(accessToken, {
    method: "PUT",
    body: JSON.stringify({ payload: workspace, expectedVersion }),
  });
}

