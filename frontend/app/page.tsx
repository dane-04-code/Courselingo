"use client";

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from "react";
import axios from "axios";

/* ─── constants ────────────────────────────────────────────────── */
const LANGUAGES = [
  { code: "FR", label: "🇫🇷 French" },
  { code: "ES", label: "🇪🇸 Spanish" },
  { code: "DE", label: "🇩🇪 German" },
  { code: "IT", label: "🇮🇹 Italian" },
  { code: "PT-BR", label: "🇵🇹 Portuguese" },
  { code: "NL", label: "🇳🇱 Dutch" },
  { code: "PL", label: "🇵🇱 Polish" },
  { code: "JA", label: "🇯🇵 Japanese" },
  { code: "ZH", label: "🇨🇳 Chinese (Simplified)" },
  { code: "KO", label: "🇰🇷 Korean" },
  { code: "RU", label: "🇷🇺 Russian" },
  { code: "SV", label: "🇸🇪 Swedish" },
  { code: "DA", label: "🇩🇰 Danish" },
  { code: "FI", label: "🇫🇮 Finnish" },
  { code: "CS", label: "🇨🇿 Czech" },
  { code: "HU", label: "🇭🇺 Hungarian" },
  { code: "RO", label: "🇷🇴 Romanian" },
  { code: "BG", label: "🇧🇬 Bulgarian" },
  { code: "TR", label: "🇹🇷 Turkish" },
];

const API_URL = "http://127.0.0.1:8000";
type Status = "idle" | "uploading" | "done" | "error";

const STEPS = [
  "Extracting text blocks…",
  "Sending to DeepL for translation…",
  "Rebuilding document layout…",
  "Preserving fonts and colours…",
  "Finalising your document…",
];

/* ─── component ────────────────────────────────────────────────── */
export default function Home() {
  const [navOpen, setNavOpen] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState(LANGUAGES[0].code);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("translated.pdf");
  const [dragging, setDragging] = useState(false);

  /* modal progress */
  const [showModal, setShowModal] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepText, setStepText] = useState(STEPS[0]);
  const [modalDone, setModalDone] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── file helpers ─────────────────────────────────────────── */
  const handleFile = useCallback((f: File) => {
    const ext = f.name.toLowerCase();
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(f.type) && !ext.endsWith(".pdf") && !ext.endsWith(".docx")) {
      setErrorMsg("Only PDF and DOCX files are accepted.");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setErrorMsg("File must be under 20 MB.");
      return;
    }
    setFile(f);
    setErrorMsg("");
    setStatus("idle");
    setDownloadUrl(null);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const reset = useCallback(() => {
    setFile(null);
    setStatus("idle");
    setErrorMsg("");
    setDownloadUrl(null);
    setShowModal(false);
    setModalDone(false);
    setProgress(0);
    if (progressInterval.current) clearInterval(progressInterval.current);
  }, []);

  /* ─── fake progress for modal ──────────────────────────────── */
  const startFakeProgress = useCallback(() => {
    let pct = 0;
    let step = 0;
    setProgress(0);
    setStepText(STEPS[0]);
    setModalDone(false);

    progressInterval.current = setInterval(() => {
      pct += 4;
      step = Math.min(Math.floor(pct / 20), STEPS.length - 1);
      setProgress(Math.min(pct, 90)); // cap at 90 until real response
      setStepText(STEPS[step]);
    }, 500);
  }, []);

  /* ─── translate ────────────────────────────────────────────── */
  const handleTranslate = useCallback(async () => {
    if (!file) return;
    setStatus("uploading");
    setErrorMsg("");
    setShowModal(true);
    startFakeProgress();

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("target_lang", language);

      const res = await axios.post(`${API_URL}/translate`, form, {
        responseType: "blob",
        timeout: 120_000,
      });

      // Complete the progress
      if (progressInterval.current) clearInterval(progressInterval.current);
      setProgress(100);
      setStepText("Done!");

      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      const cd = res.headers["content-disposition"] ?? "";
      const match = cd.match(/filename="?([^"]+)"?/);
      setDownloadName(match?.[1] ?? "translated.pdf");

      setStatus("done");
      setTimeout(() => setModalDone(true), 600);
    } catch (err: unknown) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      setShowModal(false);

      if (axios.isAxiosError(err) && err.response) {
        const data = err.response.data;
        if (data instanceof Blob) {
          const text = await data.text();
          try {
            setErrorMsg(JSON.parse(text).detail);
          } catch {
            setErrorMsg(text);
          }
        } else {
          setErrorMsg(data?.detail ?? "Translation failed.");
        }
      } else {
        setErrorMsg("Could not connect to the server.");
      }
      setStatus("error");
    }
  }, [file, language, startFakeProgress]);

  /* ─── render ───────────────────────────────────────────────── */
  return (
    <>
      {/* ──────────── NAV ──────────────────────────────────────── */}
      {/* ──────────── PROMO BANNER ──────────────────────────────── */}
      {bannerVisible && (
        <div className="promo-banner" role="banner">
          <div className="promo-banner-text">
            <span>🎉 New here? Create a free account and get <strong>3 free credits</strong> — no credit card needed.</span>
            <a href="/signup" className="promo-banner-cta">Get started free →</a>
          </div>
          <button
            className="promo-banner-close"
            onClick={() => setBannerVisible(false)}
            aria-label="Dismiss"
            type="button"
          >×</button>
        </div>
      )}

      <nav style={{ top: bannerVisible ? "44px" : "0" }}>
        <a href="#" className="logo">Course<span className="logo-dot">Lingo</span></a>
        <ul className="nav-links">
          <li><a href="#how">How it works</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#faq">FAQ</a></li>
          <li><a href="/blog">Blog</a></li>
          <li><a href="/login" className="nav-cta">Sign in →</a></li>
        </ul>
        <button
          className={`nav-hamburger${navOpen ? " open" : ""}`}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
          type="button"
        >
          <span /><span /><span />
        </button>
      </nav>

      {/* Mobile nav overlay */}
      <div className={`nav-mobile-overlay${navOpen ? " open" : ""}`} style={{ top: bannerVisible ? "109px" : "65px" }} onClick={() => setNavOpen(false)}>
        <a href="#how">How it works</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
        <a href="/blog">Blog</a>
        <a href="/login">Sign in →</a>
      </div>

      {/* ──────────── HERO ─────────────────────────────────────── */}
      <section style={{ background: "var(--cream)" }}>
        <div className="hero">
          <div className="hero-text">
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              PDF &amp; DOCX translation for course creators
            </div>
            <h1>
              Your course,
              <br />
              in <em>every</em>
              <br />
              language.
            </h1>
            <p className="hero-sub">
              Upload your workbook, slides, or handout. Get back a perfectly
              translated document — same layout, same branding, same fonts.
              No design skills needed.
            </p>
            <div className="hero-actions">
              <a href="#translate" className="btn-primary">
                Translate your PDF ↗
              </a>
              <div className="hero-note">⚡ Results in under 60 seconds</div>
            </div>

            {/* Language ticker */}
            <div className="lang-ticker">
              <span className="lang-ticker-label">19 languages →</span>
              <div className="lang-ticker-track">
                <div className="lang-ticker-inner">
                  {[
                    ["🇫🇷","French"],["🇪🇸","Spanish"],["🇩🇪","German"],["🇮🇹","Italian"],
                    ["🇵🇹","Portuguese"],["🇳🇱","Dutch"],["🇵🇱","Polish"],["🇯🇵","Japanese"],
                    ["🇨🇳","Chinese"],["🇰🇷","Korean"],["🇷🇺","Russian"],["🇸🇪","Swedish"],
                    ["🇩🇰","Danish"],["🇫🇮","Finnish"],["🇨🇿","Czech"],["🇭🇺","Hungarian"],
                    ["🇷🇴","Romanian"],["🇧🇬","Bulgarian"],["🇹🇷","Turkish"],
                    /* duplicate for seamless loop */
                    ["🇫🇷","French"],["🇪🇸","Spanish"],["🇩🇪","German"],["🇮🇹","Italian"],
                    ["🇵🇹","Portuguese"],["🇳🇱","Dutch"],["🇵🇱","Polish"],["🇯🇵","Japanese"],
                    ["🇨🇳","Chinese"],["🇰🇷","Korean"],["🇷🇺","Russian"],["🇸🇪","Swedish"],
                    ["🇩🇰","Danish"],["🇫🇮","Finnish"],["🇨🇿","Czech"],["🇭🇺","Hungarian"],
                    ["🇷🇴","Romanian"],["🇧🇬","Bulgarian"],["🇹🇷","Turkish"],
                  ].map(([flag, name], i) => (
                    <span key={i} className="lang-pill">{flag} {name}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="doc-card">
              <div className="doc-header">
                <div className="doc-icon">📄</div>
                <div>
                  <div className="doc-title">Knitting Masterclass — Workbook</div>
                  <div className="doc-meta">English · 12 pages · PDF</div>
                </div>
              </div>
              <div className="doc-lines">
                <div className="doc-line full" />
                <div className="doc-line med" />
                <div className="doc-line full" />
                <div className="doc-line short accent" />
                <div className="doc-line full" />
                <div className="doc-line med" />
              </div>
            </div>

            <div className="arrow-connector">✦ Translating to French ✦</div>

            <div className="doc-card translating">
              <div className="doc-badge">✓ Done</div>
              <div className="doc-header">
                <div className="doc-icon">🇫🇷</div>
                <div>
                  <div className="doc-title">Cours de Tricot — Cahier d&apos;Exercices</div>
                  <div className="doc-meta">Français · 12 pages · PDF</div>
                </div>
              </div>
              <div className="doc-lines">
                <div className="doc-line full" style={{ background: "var(--sage-pale)" }} />
                <div className="doc-line med" style={{ background: "var(--sage-pale)" }} />
                <div className="doc-line full" style={{ background: "var(--sage-pale)" }} />
                <div className="doc-line short accent" />
                <div className="doc-line full" style={{ background: "var(--sage-pale)" }} />
                <div className="doc-line med" style={{ background: "var(--sage-pale)" }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────── PLATFORMS ─────────────────────────────────── */}
      <div className="platforms">
        <p className="platforms-label">Used by course creators selling on</p>
        <div className="platform-logos">
          {["Kajabi", "Teachable", "Skool", "Gumroad", "Podia", "Etsy"].map((p) => (
            <span key={p} className="platform-name">{p}</span>
          ))}
        </div>
      </div>

      {/* ──────────── HOW IT WORKS ─────────────────────────────── */}
      <section className="section" id="how">
        <div className="section-label">✦ Simple process</div>
        <h2>
          Three steps to a
          <br />
          translated course.
        </h2>
        <p className="section-sub">
          No software to install. No design knowledge required. Just upload,
          choose, and download.
        </p>
        <div className="steps">
          {[
            {
              num: "01",
              title: "Upload your file",
              desc: "Drag and drop your workbook, slide deck, handout, or template. PDF and DOCX files up to 20 MB.",
            },
            {
              num: "02",
              title: "Choose your language",
              desc: "Pick from 30+ languages including French, Spanish, German, Portuguese, Japanese, and more.",
            },
            {
              num: "03",
              title: "Download & sell",
              desc: "Your translated file lands in seconds. Same layout, same branding, ready to sell.",
            },
          ].map((s) => (
            <div key={s.num} className="step">
              <div className="step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────── BEFORE / AFTER EXAMPLE ──────────────────── */}
      <section className="section example-section" id="example">
        <div className="section-label">✦ See it in action</div>
        <h2>
          Same layout.
          <br />
          New language.
        </h2>
        <p className="section-sub">
          Every heading, paragraph, and bullet point translated precisely — your branding stays completely intact.
        </p>

        <div className="example-comparison">
          {/* Original */}
          <div className="example-doc">
            <div className="example-doc-label">Original · English</div>
            <div className="example-page">
              <div className="ex-page-header">
                <div className="ex-logo-mark" />
                <div className="ex-header-lines">
                  <div className="ex-line ex-line--title" style={{ width: "72%" }} />
                  <div className="ex-line ex-line--sub" style={{ width: "45%" }} />
                </div>
              </div>
              <div className="ex-section-title">Module 1: Getting Started</div>
              <div className="ex-body-block">
                <div className="ex-line" style={{ width: "100%" }} />
                <div className="ex-line" style={{ width: "94%" }} />
                <div className="ex-line" style={{ width: "88%" }} />
                <div className="ex-line" style={{ width: "65%" }} />
              </div>
              <div className="ex-bullets">
                <div className="ex-bullet"><span className="ex-bullet-dot" />
                  <div className="ex-line" style={{ width: "82%" }} /></div>
                <div className="ex-bullet"><span className="ex-bullet-dot" />
                  <div className="ex-line" style={{ width: "74%" }} /></div>
                <div className="ex-bullet"><span className="ex-bullet-dot" />
                  <div className="ex-line" style={{ width: "88%" }} /></div>
              </div>
              <div className="ex-callout">
                <div className="ex-line ex-line--accent" style={{ width: "100%" }} />
                <div className="ex-line ex-line--accent" style={{ width: "78%" }} />
              </div>
              <div className="ex-section-title" style={{ marginTop: "1.25rem" }}>What you will need</div>
              <div className="ex-body-block">
                <div className="ex-line" style={{ width: "100%" }} />
                <div className="ex-line" style={{ width: "91%" }} />
                <div className="ex-line" style={{ width: "55%" }} />
              </div>
            </div>
            <div className="example-real-text">
              <div className="ert-block">
                <span className="ert-label">Heading</span>
                <span className="ert-en">Module 1: Getting Started</span>
              </div>
              <div className="ert-block">
                <span className="ert-label">Body</span>
                <span className="ert-en">Welcome to your knitting masterclass. In this module you will learn the foundational stitches every beginner needs.</span>
              </div>
              <div className="ert-block">
                <span className="ert-label">Bullet</span>
                <span className="ert-en">Cast-on technique for beginners</span>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="example-arrow">
            <div className="example-arrow-inner">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M6 16h20M19 9l7 7-7 7" stroke="var(--terracotta)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>French</span>
            </div>
          </div>

          {/* Translated */}
          <div className="example-doc example-doc--translated">
            <div className="example-doc-label example-doc-label--translated">Translated · Français</div>
            <div className="example-page example-page--translated">
              <div className="ex-page-header">
                <div className="ex-logo-mark" />
                <div className="ex-header-lines">
                  <div className="ex-line ex-line--title" style={{ width: "72%" }} />
                  <div className="ex-line ex-line--sub" style={{ width: "45%" }} />
                </div>
              </div>
              <div className="ex-section-title ex-section-title--fr">Module 1 : Premiers pas</div>
              <div className="ex-body-block">
                <div className="ex-line ex-line--tr" style={{ width: "100%" }} />
                <div className="ex-line ex-line--tr" style={{ width: "94%" }} />
                <div className="ex-line ex-line--tr" style={{ width: "88%" }} />
                <div className="ex-line ex-line--tr" style={{ width: "65%" }} />
              </div>
              <div className="ex-bullets">
                <div className="ex-bullet"><span className="ex-bullet-dot ex-bullet-dot--tr" />
                  <div className="ex-line ex-line--tr" style={{ width: "82%" }} /></div>
                <div className="ex-bullet"><span className="ex-bullet-dot ex-bullet-dot--tr" />
                  <div className="ex-line ex-line--tr" style={{ width: "74%" }} /></div>
                <div className="ex-bullet"><span className="ex-bullet-dot ex-bullet-dot--tr" />
                  <div className="ex-line ex-line--tr" style={{ width: "88%" }} /></div>
              </div>
              <div className="ex-callout ex-callout--tr">
                <div className="ex-line ex-line--accent-tr" style={{ width: "100%" }} />
                <div className="ex-line ex-line--accent-tr" style={{ width: "78%" }} />
              </div>
              <div className="ex-section-title ex-section-title--fr" style={{ marginTop: "1.25rem" }}>Ce dont vous aurez besoin</div>
              <div className="ex-body-block">
                <div className="ex-line ex-line--tr" style={{ width: "100%" }} />
                <div className="ex-line ex-line--tr" style={{ width: "91%" }} />
                <div className="ex-line ex-line--tr" style={{ width: "55%" }} />
              </div>
            </div>
            <div className="example-real-text">
              <div className="ert-block">
                <span className="ert-label ert-label--tr">Heading</span>
                <span className="ert-fr">Module 1 : Premiers pas</span>
              </div>
              <div className="ert-block">
                <span className="ert-label ert-label--tr">Body</span>
                <span className="ert-fr">Bienvenue dans votre cours de tricot. Dans ce module, vous apprendrez les points fondamentaux dont tout débutant a besoin.</span>
              </div>
              <div className="ert-block">
                <span className="ert-label ert-label--tr">Bullet</span>
                <span className="ert-fr">Technique de montage pour débutants</span>
              </div>
            </div>
          </div>
        </div>

        <div className="example-note">
          Layout, fonts, and spacing are pixel-perfect — only the words change.
        </div>
      </section>

      {/* ──────────── UPLOAD / TRANSLATE ───────────────────────── */}
      <section className="upload-section" id="translate">
        <div className="upload-inner">
          <div className="section-label">✦ Start translating</div>
          <h2>Upload your first file</h2>
          <p className="section-sub">
            Drop in your course material and we&apos;ll handle the rest. Your
            formatting, colours, and images are preserved exactly.
          </p>

          {/* Upload box */}
          <div
            className={`upload-box${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onInputChange}
              style={{ display: "none" }}
            />
            <div className="upload-icon">{file ? "✅" : "☁️"}</div>
            <h3>{file ? `✓ ${file.name}` : "Drop your file here"}</h3>
            <p>
              {file
                ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Ready to translate`
                : "or click to browse — PDF & DOCX files up to 20 MB"}
            </p>
          </div>

          {/* Language selector */}
          <div className="lang-row">
            <span className="lang-label">Translate to:</span>
            <select
              className="lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={status === "uploading"}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="error-msg">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Action buttons */}
          {status === "done" && downloadUrl ? (
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <a href={downloadUrl} download={downloadName} className="btn-download">
                ↓ Download translated file
              </a>
              <button onClick={reset} className="btn-reset">
                Translate another
              </button>
            </div>
          ) : (
            <button
              className={`btn-translate${status === "uploading" ? " uploading" : ""}`}
              onClick={handleTranslate}
              disabled={!file || status === "uploading"}
            >
              {status === "uploading" ? (
                <>
                  <span className="spinner" /> Translating…
                </>
              ) : (
                "Translate now →"
              )}
            </button>
          )}
        </div>
      </section>

      {/* ──────────── PRICING ──────────────────────────────────── */}
      <section className="section" id="pricing">
        <div className="section-label">✦ Simple pricing</div>
        <h2>
          Pay only for
          <br />
          what you use.
        </h2>
        <p className="section-sub">
          No subscriptions. No monthly fees. Pay per document, or save with a pack.
        </p>
        <div className="pricing-grid">
          {/* Starter */}
          <div className="price-card">
            <div className="price-name">Starter</div>
            <div className="price-amount">$9</div>
            <div className="price-desc">3 credits · one-time</div>
            <ul className="price-features">
              <li>3 credits included</li>
              <li>1 credit = 1 short document</li>
              <li>19 languages</li>
              <li>Layout & fonts preserved</li>
              <li>Download instantly</li>
            </ul>
            <button className="btn-outline">Get started</button>
          </div>
          {/* Course Pack */}
          <div className="price-card featured">
            <div className="price-tag">Most popular</div>
            <div className="price-name">Course Pack</div>
            <div className="price-amount">$49</div>
            <div className="price-desc">15 credits · one-time</div>
            <ul className="price-features">
              <li>15 credits included</li>
              <li>Best for multi-language launches</li>
              <li>19 languages</li>
              <li>Layout & fonts preserved</li>
              <li>Credits never expire</li>
            </ul>
            <button className="btn-primary-sm">Get the pack</button>
          </div>
          {/* Pro Pack */}
          <div className="price-card">
            <div className="price-name">Pro Pack</div>
            <div className="price-amount">$99</div>
            <div className="price-desc">40 credits · one-time</div>
            <ul className="price-features">
              <li>40 credits included</li>
              <li>Best value per credit</li>
              <li>19 languages</li>
              <li>Layout & fonts preserved</li>
              <li>Credits never expire</li>
            </ul>
            <button className="btn-outline">Get the pro pack</button>
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: "0.82rem", color: "var(--ink-light)", marginTop: "1.5rem" }}>
          Credit cost scales with document size — short docs (≤20k chars) cost 1 credit · large docs (120k+) cost 6 credits.
        </p>
      </section>

      {/* ──────────── TESTIMONIALS ─────────────────────────────── */}
      <div className="testimonials">
        <div className="testimonials-inner">
          <div className="section-label">✦ Happy creators</div>
          <h2>Course creators love it.</h2>
          <div className="testi-grid">
            {[
              {
                text: "I translated my entire knitting workbook into French in under 5 minutes. It looked exactly like the original — I was honestly shocked.",
                initials: "SB",
                name: "Sarah B.",
                role: "Knitting course creator · Kajabi",
              },
              {
                text: "I've been putting off translating my course for two years because I thought it would be complicated. This took me 3 minutes.",
                initials: "MR",
                name: "Margot R.",
                role: "Yoga teacher & course creator · Teachable",
              },
              {
                text: "Finally a tool built for non-techies. My Spanish-speaking audience has been asking for my templates for months — now they have them.",
                initials: "JL",
                name: "Julie L.",
                role: "Craft business coach · Gumroad",
              },
            ].map((t) => (
              <div key={t.initials} className="testi-card">
                <div className="stars">★★★★★</div>
                <div className="testi-text">&ldquo;{t.text}&rdquo;</div>
                <div className="testi-author">
                  <div className="testi-avatar">{t.initials}</div>
                  <div>
                    <div className="testi-name">{t.name}</div>
                    <div className="testi-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ──────────── FAQ ──────────────────────────────────────── */}
      <section className="section" id="faq">
        <div className="section-label">✦ Questions</div>
        <h2>Common questions.</h2>
        <div className="faq-list">
          {[
            {
              q: "Will my formatting be preserved?",
              a: "Yes — CourseLingo rebuilds your document text-by-text, preserving fonts, colours, layout, and images. Your translated file will look identical to the original.",
            },
            {
              q: "What file types are supported?",
              a: "PDF and DOCX (Word) files are fully supported. Workbooks, handouts, templates, slide decks, and guides all work great.",
            },
            {
              q: "How long does it take?",
              a: "Most documents translate in under 60 seconds. Longer documents (50+ pages) may take up to 3 minutes.",
            },
            {
              q: "How accurate are the translations?",
              a: "We use DeepL — the same translation engine trusted by major publishers and businesses. It's consistently rated the most accurate translation API available.",
            },
            {
              q: "Is my file kept private?",
              a: "Your files are processed securely and deleted from our servers within 24 hours. We never store, share, or read your course content.",
            },
            {
              q: "Can I translate the same file into multiple languages?",
              a: "Yes! Each translation is one credit. If you want French AND Spanish versions, that's two credits. The Course Pack at $49 gives you 10 translations — perfect for launching in multiple markets.",
            },
          ].map((item) => (
            <div key={item.q} className="faq-item">
              <div className="faq-q">
                {item.q}
                <span className="faq-toggle">+</span>
              </div>
              <div className="faq-a">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────── FOOTER ───────────────────────────────────── */}
      <footer>
        <p>
          <strong>CourseLingo</strong> — Translate your course materials without
          losing your branding.
        </p>
        <p style={{ marginTop: "0.5rem" }}>
          Made for creators, by creators. ·{" "}
          <a href="#">Privacy</a> ·{" "}
          <a href="#">Terms</a>
        </p>
      </footer>

      {/* ──────────── MODAL ────────────────────────────────────── */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && modalDone) {
              setShowModal(false);
            }
          }}
        >
          <div className="modal">
            {modalDone ? (
              <>
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
                <h3>Translation complete!</h3>
                <p>
                  Your translated file is ready. It looks exactly like the
                  original — just in a new language.
                </p>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={downloadName}
                    className="btn-primary"
                    style={{ margin: "0 auto 1rem", display: "inline-flex" }}
                    onClick={() => setShowModal(false)}
                  >
                    ↓ Download file
                  </a>
                )}
                <div style={{ fontSize: "0.8rem", color: "var(--ink-light)" }}>
                  You can also download from the section below.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⏳</div>
                <h3>Translating your file</h3>
                <p>
                  Translating to{" "}
                  {LANGUAGES.find((l) => l.code === language)?.label ?? language}…
                </p>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="progress-step">{stepText}</div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
