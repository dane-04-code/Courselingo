export default function PaymentCancelPage() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--cream)", padding: "2rem",
    }}>
      <div style={{
        maxWidth: 480, width: "100%", textAlign: "center",
        background: "white", borderRadius: 16, padding: "3rem 2rem",
        border: "1px solid var(--border)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>👋</div>
        <h1 style={{ fontFamily: "var(--font-fraunces), Fraunces, serif", fontSize: "1.8rem", fontWeight: 400, marginBottom: "0.75rem" }}>
          No worries
        </h1>
        <p style={{ color: "var(--ink-light)", lineHeight: 1.6, marginBottom: "2rem" }}>
          You cancelled the checkout — no charge was made. Come back whenever you&apos;re ready.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/#pricing" className="btn-primary" style={{ display: "inline-block" }}>
            View pricing →
          </a>
          <a href="/translator" style={{ display: "inline-flex", alignItems: "center", color: "var(--ink-light)", fontSize: "0.9rem", textDecoration: "underline" }}>
            Back to translator
          </a>
        </div>
      </div>
    </div>
  );
}
