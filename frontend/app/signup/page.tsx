"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

/* ─── Google SVG ─────────────────────────────────────────────────────────── */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.566 2.684-3.874 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

/* ─── Spinner ────────────────────────────────────────────────────────────── */

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className="auth-spinner"
      style={{
        borderColor: dark
          ? "rgba(26,23,20,0.15)"
          : "rgba(255,255,255,0.3)",
        borderTopColor: dark ? "var(--ink)" : "white",
      }}
      aria-hidden="true"
    />
  );
}

/* ─── Success state ──────────────────────────────────────────────────────── */

function SuccessState({ email }: { email: string }) {
  return (
    <div className="auth-success">
      {/* Sage checkmark circle */}
      <div className="auth-success-icon" aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <circle cx="28" cy="28" r="28" fill="var(--sage-pale)" />
          <circle cx="28" cy="28" r="20" fill="var(--sage)" />
          <path
            d="M19 28.5L24.5 34L37 22"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 className="auth-heading" style={{ marginTop: "1.25rem" }}>
        Check your email
      </h2>
      <p className="auth-success-body">
        We sent a confirmation link to{" "}
        <strong>{email}</strong>. Click it to activate your account.
      </p>

      <a href="/login" className="auth-success-back">
        Back to login
      </a>
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function SignupPage() {
  const supabase = createClient();

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [showConf, setShowConf]   = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [done, setDone]           = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  /* ── Google OAuth ────────────────────────────────────────────────────── */

  const handleGoogle = async () => {
    setOauthLoading(true);
    setError("");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  /* ── Email sign-up ───────────────────────────────────────────────────── */

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSentEmail(email);
    setDone(true);
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* Logo */}
        <a href="/" className="auth-logo">
          Course<span style={{ color: "var(--terracotta)" }}>Lingo</span>
        </a>

        {/* Success state replaces the entire form */}
        {done ? (
          <SuccessState email={sentEmail} />
        ) : (
          <>
            {/* Headings */}
            <h1 className="auth-heading">Create your account</h1>
            <p className="auth-subtext">Start translating your course materials</p>

            {/* Google button */}
            <button
              className="auth-google-btn"
              type="button"
              onClick={handleGoogle}
              disabled={oauthLoading || loading}
              aria-label="Continue with Google"
            >
              {oauthLoading ? <Spinner dark /> : <GoogleIcon />}
              <span>Continue with Google</span>
            </button>

            {/* Divider */}
            <div className="auth-divider" aria-hidden="true">
              <span>or</span>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate>

              {/* Email */}
              <div className="auth-field">
                <label htmlFor="signup-email" className="auth-label">Email</label>
                <input
                  id="signup-email"
                  className="auth-input"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading || oauthLoading}
                />
              </div>

              {/* Password */}
              <div className="auth-field">
                <label htmlFor="signup-password" className="auth-label">Password</label>
                <div className="auth-input-wrap">
                  <input
                    id="signup-password"
                    className="auth-input"
                    type={showPass ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading || oauthLoading}
                    style={{ paddingRight: "2.8rem" }}
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPass ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="auth-field">
                <label htmlFor="signup-confirm" className="auth-label">Confirm password</label>
                <div className="auth-input-wrap">
                  <input
                    id="signup-confirm"
                    className="auth-input"
                    type={showConf ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    disabled={loading || oauthLoading}
                    style={{ paddingRight: "2.8rem" }}
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowConf((v) => !v)}
                    aria-label={showConf ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showConf ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                className="auth-submit-btn"
                type="submit"
                disabled={loading || oauthLoading}
              >
                {loading ? <Spinner /> : "Create account →"}
              </button>

            </form>

            {/* Footer */}
            <p className="auth-footer">
              Already have an account?{" "}
              <a href="/login" className="auth-footer-link">Sign in</a>
            </p>
          </>
        )}

      </div>
    </div>
  );
}
