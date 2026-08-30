function preferredSpanishVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang.toLowerCase() === "es-ar")
    || voices.find((voice) => voice.lang.toLowerCase().startsWith("es-") && voice.localService)
    || voices.find((voice) => voice.lang.toLowerCase().startsWith("es"))
    || null;
}

export function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function speakSpanish(text, { rate = 0.92, onStart, onEnd } = {}) {
  if (!text || !canSpeak()) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-AR";
  utterance.rate = rate;
  utterance.pitch = 1;
  utterance.voice = preferredSpanishVoice();
  utterance.onstart = onStart || null;
  utterance.onend = onEnd || null;
  utterance.onerror = onEnd || null;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}
