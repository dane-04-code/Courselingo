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
      <nav>
        <a href="#" className="logo">
          Course<span className="logo-dot">Lingo</span>
        </a>
        <ul className="nav-links">
          <li><a href="#how">How it works</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#faq">FAQ</a></li>
          <li><a href="#translate" className="nav-cta">Translate a PDF →</a></li>
        </ul>
      </nav>

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
          {/* Single Doc */}
          <div className="price-card">
            <div className="price-name">Single Doc</div>
            <div className="price-amount">$9</div>
            <div className="price-desc">per document</div>
            <ul className="price-features">
              <li>1 PDF or DOCX translated</li>
              <li>Up to 20 MB file size</li>
              <li>30+ languages</li>
              <li>Layout preserved</li>
              <li>Download instantly</li>
            </ul>
            <button className="btn-outline">Get started</button>
          </div>
          {/* Course Pack */}
          <div className="price-card featured">
            <div className="price-tag">Most popular</div>
            <div className="price-name">Course Pack</div>
            <div className="price-amount">$49</div>
            <div className="price-desc">up to 10 documents</div>
            <ul className="price-features">
              <li>10 files translated</li>
              <li>Unlimited file size</li>
              <li>30+ languages</li>
              <li>Layout preserved</li>
              <li>Priority processing</li>
            </ul>
            <button className="btn-primary-sm">Get the pack</button>
          </div>
          {/* Full Bundle */}
          <div className="price-card">
            <div className="price-name">Full Bundle</div>
            <div className="price-amount">$99</div>
            <div className="price-desc">one-time payment</div>
            <ul className="price-features">
              <li>Unlimited documents</li>
              <li>Unlimited file size</li>
              <li>30+ languages</li>
              <li>Layout preserved</li>
              <li>Lifetime access</li>
            </ul>
            <button className="btn-outline">Get lifetime access</button>
          </div>
        </div>
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
