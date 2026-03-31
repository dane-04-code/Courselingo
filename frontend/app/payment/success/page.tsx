"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type State = "loading" | "done" | "pending" | "error";

export default function PaymentSuccessPage() {
  const params    = useSearchParams();
  const sessionId = params.get("session_id") ?? "";
  const [state, setState]     = useState<State>("loading");
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan]       = useState("");

  useEffect(() => {
    if (!sessionId) { setState("error"); return; }

    fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => {
        if (r.status === 202) return { status: "pending" };
        return r.json();
      })
      .then((data) => {
        if (data.status === "pending") {
          setState("pending");
        } else if (data.error) {
          setState("error");
        } else {
          setPlan(data.plan ?? "");
          setCredits(data.credits_remaining ?? null);
          setState("done");
        }
      })
      .catch(() => setState("error"));
  }, [sessionId]);

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
        {state === "loading" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⏳</div>
            <h1 style={{ fontFamily: "var(--font-fraunces), Fraunces, serif", fontSize: "1.6rem", fontWeight: 400 }}>
              Confirming your payment…
            </h1>
          </>
        )}
        {state === "done" && (
          <>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
            <h1 style={{ fontFamily: "var(--font-fraunces), Fraunces, serif", fontSize: "1.8rem", fontWeight: 400, marginBottom: "0.75rem" }}>
              Payment confirmed!
            </h1>
            <p style={{ color: "var(--ink-light)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              Your {plan.replace(/_/g, " ")} credits have been added.
              {credits !== null && <> You now have <strong>{credits} credit{credits !== 1 ? "s" : ""}</strong> remaining.</>}
            </p>
            <a href="/translator" className="btn-primary" style={{ display: "inline-block" }}>
              Start translating →
            </a>
          </>
        )}
        {state === "pending" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⌛</div>
            <h1 style={{ fontFamily: "var(--font-fraunces), Fraunces, serif", fontSize: "1.6rem", fontWeight: 400, marginBottom: "0.75rem" }}>
              Payment processing
            </h1>
            <p style={{ color: "var(--ink-light)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              Your payment is still processing. Credits will appear within a few minutes.
            </p>
            <a href="/translator" style={{ color: "var(--terracotta)", textDecoration: "underline" }}>
              Go to translator →
            </a>
          </>
        )}
        {state === "error" && (
          <>
            <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⚠️</div>
            <h1 style={{ fontFamily: "var(--font-fraunces), Fraunces, serif", fontSize: "1.6rem", fontWeight: 400, marginBottom: "0.75rem" }}>
              Something went wrong
            </h1>
            <p style={{ color: "var(--ink-light)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              We couldn&apos;t confirm your payment. If you were charged, credits will be added automatically within a few minutes.
            </p>
            <a href="mailto:support@courselingo.com" style={{ color: "var(--terracotta)", textDecoration: "underline" }}>
              Contact support
            </a>
          </>
        )}
      </div>
    </div>
  );
}
