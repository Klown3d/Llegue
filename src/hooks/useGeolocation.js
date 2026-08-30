import { useEffect, useState } from "react";

export function useGeolocation(enabled = true) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(enabled ? "requesting" : "idle");

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) { setStatus("error"); setError("Este dispositivo no ofrece geolocalización."); return; }
    const watchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        setPosition({ coordinates: [coords.longitude, coords.latitude], accuracy: coords.accuracy, heading: coords.heading, speed: coords.speed, timestamp });
        setStatus("ready"); setError("");
      },
      (geolocationError) => {
        setStatus("error");
        setError(geolocationError.code === 1 ? "Necesitamos permiso de ubicación para navegar." : "No pudimos obtener una ubicación precisa.");
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return { position, error, status };
}
