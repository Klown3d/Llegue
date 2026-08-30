export function Logo({ compact = false, inverse = false }) {
  return (
    <div className={`brand-logo ${compact ? "brand-logo-compact" : ""}`} aria-label="Llegue, tu pedido en camino">
      <span className="brand-mark-shell" aria-hidden="true"><img src="/icons/icon-red-192.png" alt="" className="brand-mark" /></span>
      {!compact && (
        <div className={`brand-lockup ${inverse ? "text-white" : "text-ink"}`}>
          <div className="brand-name">LLEGUE</div>
          <div className="brand-tagline">Tu pedido, en camino.</div>
        </div>
      )}
    </div>
  );
}
