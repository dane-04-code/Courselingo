"use client";

import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { createClient } from "@/lib/supabase/client";

/* ─── constants ─────────────────────────────────────────────────────────── */

const LANGUAGES = [
  { code: "FR",    flag: "🇫🇷", name: "French"              },
  { code: "ES",    flag: "🇪🇸", name: "Spanish"             },
  { code: "DE",    flag: "🇩🇪", name: "German"              },
  { code: "IT",    flag: "🇮🇹", name: "Italian"             },
  { code: "PT-BR", flag: "🇵🇹", name: "Portuguese"          },
  { code: "NL",    flag: "🇳🇱", name: "Dutch"               },
  { code: "PL",    flag: "🇵🇱", name: "Polish"              },
  { code: "JA",    flag: "🇯🇵", name: "Japanese"            },
  { code: "ZH",    flag: "🇨🇳", name: "Chinese"             },
  { code: "KO",    flag: "🇰🇷", name: "Korean"              },
  { code: "RU",    flag: "🇷🇺", name: "Russian"             },
  { code: "SV",    flag: "🇸🇪", name: "Swedish"             },
  { code: "DA",    flag: "🇩🇰", name: "Danish"              },
  { code: "FI",    flag: "🇫🇮", name: "Finnish"             },
  { code: "CS",    flag: "🇨🇿", name: "Czech"               },
  { code: "HU",    flag: "🇭🇺", name: "Hungarian"           },
  { code: "RO",    flag: "🇷🇴", name: "Romanian"            },
  { code: "BG",    flag: "🇧🇬", name: "Bulgarian"           },
  { code: "TR",    flag: "🇹🇷", name: "Turkish"             },
];

const API_URL = "http://127.0.0.1:8000";
type Status = "idle" | "uploading" | "done" | "error";

const STEPS = [
  "Extracting text blocks…",
  "Mapping paragraph structure…",
  "Rebuilding document layout…",
  "Preserving fonts & colours…",
  "Finalising your document…",
];

/* ─── helpers ───────────────────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

/* ─── component ─────────────────────────────────────────────────────────── */

export default function TranslatorPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const [file, setFile]               = useState<File | null>(null);
  const [language, setLanguage]       = useState(LANGUAGES[0].code);
  const [status, setStatus]           = useState<Status>("idle");
  const [errorMsg, setErrorMsg]       = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("translated.pdf");
  const [dragging, setDragging]       = useState(false);

  /* modal progress */
  const [showModal, setShowModal]     = useState(false);
  const [progress, setProgress]       = useState(0);
  const [stepText, setStepText]       = useState(STEPS[0]);
  const [modalDone, setModalDone]     = useState(false);

  const inputRef        = useRef<HTMLInputElement>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── file helpers ──────────────────────────────────────────────────── */

  const handleFile = useCallback((f: File) => {
    const ext     = f.name.toLowerCase();
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

  const onDragOver  = useCallback((e: DragEvent<HTMLDivElement>) => {
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

  /* ─── fake progress for modal ───────────────────────────────────────── */

  const startFakeProgress = useCallback(() => {
    let pct  = 0;
    let step = 0;
    setProgress(0);
    setStepText(STEPS[0]);
    setModalDone(false);

    progressInterval.current = setInterval(() => {
      pct  += 4;
      step  = Math.min(Math.floor(pct / 20), STEPS.length - 1);
      setProgress(Math.min(pct, 90)); // cap at 90 until real response
      setStepText(STEPS[step]);
    }, 500);
  }, []);

  /* ─── translate ─────────────────────────────────────────────────────── */

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
        timeout: 300_000,
      });

      if (progressInterval.current) clearInterval(progressInterval.current);
      setProgress(100);
      setStepText("Done!");

      const blob = new Blob([res.data]);
      const url  = URL.createObjectURL(blob);
      setDownloadUrl(url);

      const cd    = res.headers["content-disposition"] ?? "";
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

  /* ─── derived ───────────────────────────────────────────────────────── */

  const selectedLang = LANGUAGES.find((l) => l.code === language);
  const isUploading  = status === "uploading";
  const isDone       = status === "done" && !!downloadUrl;

  /* ─── render ────────────────────────────────────────────────────────── */

  return (
    <div className="translator-layout">

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <header className="translator-header">
        <a href="/" className="logo">
          Course<span className="logo-dot">Lingo</span>
        </a>

        <div className="translator-header-right">
          <div className="user-avatar" aria-label="User avatar" title={user?.email ?? ""}>
            <span>{user?.email?.slice(0, 2).toUpperCase() ?? "?"}</span>
          </div>
          <button
            type="button"
            className="signout-link"
            onClick={handleSignOut}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── MAIN ─────────────────────────────────────────────────────── */}
      <main className="translator-main">
        <div className="translator-content">

          {/* ── Page heading ─────────────────────────────────────────── */}
          <div className="translator-heading-group">
            <div className="translator-section-label">✦ Document translator</div>
            <h1 className="translator-title">
              Translate your course material
            </h1>
            <p className="translator-subtitle">
              Upload a PDF or DOCX file and choose your target language.
            </p>
          </div>

          {/* ── Idle: language select + upload ───────────────────────── */}
          {!isUploading && !isDone && (
            <>
              <div className="tr-lang-row">
                <label htmlFor="lang-select" className="tr-lang-label">Translate to</label>
                <select
                  id="lang-select"
                  className="tr-lang-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div
                className={`tr-upload-box${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
                onClick={() => inputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                role="button"
                tabIndex={0}
                aria-label="File upload area"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={onInputChange}
                  style={{ display: "none" }}
                />
                {file ? (
                  <>
                    <div className="tr-file-icon" aria-hidden="true">
                      <svg width="44" height="52" viewBox="0 0 30 36" fill="none">
                        <path d="M3 0C1.34 0 0 1.34 0 3V33C0 34.66 1.34 36 3 36H27C28.66 36 30 34.66 30 33V9L21 0H3Z" fill="#E5DDD5"/>
                        <path d="M21 0L30 9H21V0Z" fill="#C9BEB4"/>
                        <rect x="6" y="15" width="18" height="2" rx="1" fill="#A89E97"/>
                        <rect x="6" y="20" width="13" height="2" rx="1" fill="#A89E97"/>
                        <rect x="6" y="25" width="15" height="2" rx="1" fill="#A89E97"/>
                      </svg>
                    </div>
                    <div className="tr-file-name">{file.name}</div>
                  </>
                ) : (
                  <>
                    <div className="tr-upload-icon-wrap" aria-hidden="true">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M12 4L12 16M12 4L8 8M12 4L16 8" stroke="var(--ink-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M4 18H20" stroke="var(--ink-light)" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <p className="tr-upload-hint">Drop file here or <span>browse</span></p>
                    <p className="tr-upload-sub">PDF or DOCX · up to 20 MB</p>
                  </>
                )}
              </div>

              {errorMsg && (
                <div className="error-msg" role="alert">⚠️ {errorMsg}</div>
              )}

              <button
                className="btn-translate translator-btn-translate"
                onClick={handleTranslate}
                disabled={!file}
                type="button"
              >
                {selectedLang ? `Translate to ${selectedLang.name} →` : "Translate now →"}
              </button>
            </>
          )}

          {/* ── Translating / done: two-box view ─────────────────────── */}
          {(isUploading || isDone) && (
            <>
              <div className="tr-translation-view">

                {/* Left card — original */}
                <div className="tr-doc-card">
                  <div className="tr-doc-card-label">Original</div>
                  <div className="tr-doc-card-icon">
                    <svg width="52" height="62" viewBox="0 0 30 36" fill="none">
                      <path d="M3 0C1.34 0 0 1.34 0 3V33C0 34.66 1.34 36 3 36H27C28.66 36 30 34.66 30 33V9L21 0H3Z" fill="#E5DDD5"/>
                      <path d="M21 0L30 9H21V0Z" fill="#C9BEB4"/>
                      <rect x="6" y="15" width="18" height="2" rx="1" fill="#A89E97"/>
                      <rect x="6" y="20" width="13" height="2" rx="1" fill="#A89E97"/>
                      <rect x="6" y="25" width="15" height="2" rx="1" fill="#A89E97"/>
                    </svg>
                  </div>
                  <div className="tr-doc-card-name">{file?.name}</div>
                </div>

                {/* Connector arrow */}
                <div className="tr-connector" aria-hidden="true">
                  <div className={`tr-connector-track${isUploading ? " active" : ""}`}>
                    <div className="tr-connector-dot" />
                    <div className="tr-connector-dot" />
                    <div className="tr-connector-dot" />
                  </div>
                  <svg className="tr-connector-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* Right card — output */}
                <div className={`tr-doc-card tr-doc-card-output${isDone ? " is-done" : " is-loading"}`}>
                  {isDone ? (
                    <>
                      <div className="tr-doc-card-label">Your translated document</div>
                      <div className="tr-doc-card-icon">
                        <div className="tr-done-icon">
                          <svg width="52" height="62" viewBox="0 0 30 36" fill="none">
                            <path d="M3 0C1.34 0 0 1.34 0 3V33C0 34.66 1.34 36 3 36H27C28.66 36 30 34.66 30 33V9L21 0H3Z" fill="#d6e8d6"/>
                            <path d="M21 0L30 9H21V0Z" fill="#b8d4b8"/>
                            <rect x="6" y="15" width="18" height="2" rx="1" fill="#7aaa7a"/>
                            <rect x="6" y="20" width="13" height="2" rx="1" fill="#7aaa7a"/>
                            <rect x="6" y="25" width="15" height="2" rx="1" fill="#7aaa7a"/>
                          </svg>
                          <span className="tr-done-flag">{selectedLang?.flag}</span>
                        </div>
                      </div>
                      <div className="tr-doc-card-name">{downloadName}</div>
                    </>
                  ) : (
                    <>
                      <div className="tr-doc-card-label">
                        Your translated document
                      </div>
                      <div className="tr-steps-list">
                        {STEPS.map((step, i) => {
                          const currentStep = Math.min(Math.floor(progress / 20), STEPS.length - 1);
                          const done   = i < currentStep;
                          const active = i === currentStep;
                          return (
                            <div
                              key={i}
                              className={`tr-step-item${done ? " done" : active ? " active" : " pending"}`}
                            >
                              <span className="tr-step-bullet" aria-hidden="true">
                                {done ? "✓" : active ? "✦" : "·"}
                              </span>
                              <span className="tr-step-label">{step}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

              </div>

              {isDone && (
                <div className="translator-actions">
                  <a
                    href={downloadUrl!}
                    download={downloadName}
                    className="btn-download translator-btn-full"
                  >
                    ↓ Download translated file
                  </a>
                  <button onClick={reset} className="translator-btn-reset" type="button">
                    Translate another file
                  </button>
                </div>
              )}
            </>
          )}

        </div>
      </main>

      {/* ── DOCUMENT READY MODAL ──────────────────────────────────────── */}
      {modalDone && (
        <div
          className="ready-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Your document is ready"
          onClick={() => setModalDone(false)}
        >
          <div
            className="ready-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              className="ready-close"
              onClick={() => setModalDone(false)}
              aria-label="Close"
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Icon composition: document + checkmark badge */}
            <div className="ready-icon-wrap" aria-hidden="true">
              <div className="ready-doc-icon">
                {/* Document SVG — warm beige, corner fold, consistent with app style */}
                <svg width="72" height="86" viewBox="0 0 30 36" fill="none">
                  <path d="M3 0C1.34 0 0 1.34 0 3V33C0 34.66 1.34 36 3 36H27C28.66 36 30 34.66 30 33V9L21 0H3Z" fill="#E5DDD5"/>
                  <path d="M21 0L30 9H21V0Z" fill="#C9BEB4"/>
                  <rect x="6" y="14" width="18" height="2" rx="1" fill="#B8ADA6"/>
                  <rect x="6" y="19" width="13" height="2" rx="1" fill="#B8ADA6"/>
                  <rect x="6" y="24" width="15" height="2" rx="1" fill="#B8ADA6"/>
                  <rect x="6" y="29" width="10" height="2" rx="1" fill="#B8ADA6"/>
                </svg>
                {/* Checkmark badge — solid sage circle, white check */}
                <div className="ready-check-badge" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="9" fill="var(--sage)"/>
                    <path d="M5 9.5L7.5 12L13 6.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Heading + filename */}
            <h2 className="ready-heading">Your document is ready</h2>
            <p className="ready-filename" title={downloadName}>{downloadName}</p>

            {/* Language pill */}
            {selectedLang && (
              <div className="ready-lang-pill">
                {selectedLang.name}
              </div>
            )}

            {/* Download CTA */}
            <a
              href={downloadUrl ?? "#"}
              download={downloadName}
              className="ready-download-btn"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2V11M8 11L4.5 7.5M8 11L11.5 7.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 13H14" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Download your translation
            </a>

            {/* Translate another document link */}
            <button
              className="ready-reset-link"
              onClick={reset}
              type="button"
            >
              Translate another document
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
