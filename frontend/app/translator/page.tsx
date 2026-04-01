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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type Status = "idle" | "uploading" | "done" | "error";

const STEPS = [
  "Extracting text blocks…",
  "Mapping paragraph structure…",
  "Rebuilding document layout…",
  "Preserving fonts & colours…",
  "Finalising your document…",
];

interface HistoryItem {
  id: string;
  filename: string;
  target_lang: string;
  credits_deducted: number;
  created_at: string;
}

const LANG_MAP = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]));

/* ─── helpers ───────────────────────────────────────────────────────────── */


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
  const [progress, setProgress]       = useState(0);
  const [stepText, setStepText]       = useState(STEPS[0]);
  const [modalDone, setModalDone]     = useState(false);

  /* split-layout state */
  const [history, setHistory]                   = useState<HistoryItem[]>([]);
  const [credits, setCredits]                   = useState<number | null>(null);
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
  const [pageCount, setPageCount]               = useState<number | null>(null);
  const [userPlan, setUserPlan]                 = useState<string>("free");

  const inputRef         = useRef<HTMLInputElement>(null);
  const langSelectRef    = useRef<HTMLSelectElement>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  /* resize select to fit selected option text */
  useEffect(() => {
    const select = langSelectRef.current;
    if (!select) return;
    const text = select.options[select.selectedIndex]?.text ?? "";
    const sizer = document.createElement("span");
    sizer.style.cssText = "visibility:hidden;position:absolute;white-space:nowrap;";
    const cs = getComputedStyle(select);
    sizer.style.fontSize   = cs.fontSize;
    sizer.style.fontFamily = cs.fontFamily;
    sizer.style.fontWeight = cs.fontWeight;
    sizer.textContent = text;
    document.body.appendChild(sizer);
    const w = sizer.offsetWidth;
    document.body.removeChild(sizer);
    // left padding (1rem≈16px) + right padding for chevron (2.6rem≈42px) + 2px border
    select.style.width = `${w + 16 + 42 + 2}px`;
  }, [language]);

  /* ─── credits + history ─────────────────────────────────────────────── */

  const fetchCreditsAndHistory = useCallback(async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;

    const [creditsRes, historyRes] = await Promise.all([
      supabase
        .from("user_credits")
        .select("credits_remaining, plan")
        .eq("user_id", u.id)
        .single(),
      supabase
        .from("translation_history")
        .select("id, filename, target_lang, credits_deducted, created_at")
        .eq("user_id", u.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (creditsRes.data) {
      setCredits(creditsRes.data.credits_remaining);
      setUserPlan(creditsRes.data.plan ?? "free");
    }
    if (historyRes.data) setHistory(historyRes.data);
  }, [supabase]);

  // Fetch credits + history on mount
  useEffect(() => {
    fetchCreditsAndHistory();
  }, [fetchCreditsAndHistory]);

  // Estimate credit cost whenever a new file is selected
  useEffect(() => {
    if (!file) { setEstimatedCredits(null); setPageCount(null); return; }
    const controller = new AbortController();
    const form = new FormData();
    form.append("file", file);
    fetch(`${API_URL}/estimate`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        setEstimatedCredits(d.credits_required ?? null);
        setPageCount(d.page_count ?? null);
      })
      .catch(() => {}); // best-effort — don't block the UI
    return () => controller.abort();
  }, [file]);

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
    setModalDone(false);
    setProgress(0);
    if (progressInterval.current) clearInterval(progressInterval.current);
  }, []);

  const handleTranslateAgain = useCallback((langCode: string) => {
    setLanguage(langCode);
    reset();
  }, [reset]);

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
    if (credits !== null && estimatedCredits !== null && credits < estimatedCredits) {
      setErrorMsg(`You need ${estimatedCredits} credit${estimatedCredits !== 1 ? "s" : ""} but only have ${credits}. Buy more credits to continue.`);
      return;
    }
    setStatus("uploading");
    setErrorMsg("");
    startFakeProgress();

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("target_lang", language);
      form.append("watermark", userPlan === "free" ? "true" : "false");

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

      // Deduct credits atomically
      const creditsToDeduct = estimatedCredits ?? 1;
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        await supabase.rpc("deduct_credit", {
          p_user_id:         currentUser.id,
          p_filename:        file.name,
          p_output_filename: match?.[1] ?? "translated.pdf",
          p_target_lang:     language,
          p_file_size_bytes: file.size,
          p_amount:          creditsToDeduct,
        });
      }

      setStatus("done");
      setTimeout(() => setModalDone(true), 600);
      fetchCreditsAndHistory();
    } catch (err: unknown) {
      if (progressInterval.current) clearInterval(progressInterval.current);

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
  }, [file, language, credits, estimatedCredits, userPlan, supabase, startFakeProgress, fetchCreditsAndHistory]);

  /* ─── derived ─────────────────────────────────────────────────────────── */
  const selectedLang  = LANGUAGES.find((l) => l.code === language);
  const isUploading   = status === "uploading";
  const isDone        = status === "done" && !!downloadUrl;

  /* ─── render ───────────────────────────────────────────────────────────── */
  return (
    <div className="translator-layout">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="translator-header">
        <a href="/" className="logo">
          Course<span className="logo-dot">Lingo</span>
        </a>
        <div className="translator-header-right">
          <div className="user-avatar" title={user?.email ?? ""}>
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

      {/* ── SPLIT MAIN ─────────────────────────────────────────────────── */}
      <main className="translator-main">

        {/* LEFT PANEL */}
        <div className="tr-left">

          {/* Credit balance */}
          <div className="tr-credit-card">
            <div className="tr-credit-left">
              <div className="tr-credit-label">Credits remaining</div>
              <div className="tr-credit-amount">
                {credits === null ? "—" : credits}
              </div>
            </div>
            <a href="/#pricing" className="tr-credit-buy">Buy more →</a>
          </div>

          {/* Heading */}
          <div className="tr-left-heading">
            <div className="tr-left-eyebrow">✦ New translation</div>
            <div className="tr-left-title">Translate your document</div>
          </div>

          {/* Language selector */}
          <div className="tr-lang-row" style={{ margin: 0 }}>
            <label htmlFor="lang-select" className="tr-lang-label">Translate to</label>
            <select
              id="lang-select"
              ref={langSelectRef}
              className="tr-lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isUploading}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
              ))}
            </select>
          </div>

          {/* Upload box */}
          <div
            className={`tr-upload-box${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
            onClick={() => !isUploading && inputRef.current?.click()}
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

          {/* Credit cost estimate */}
          <div className="tr-estimate-row">
            <span>
              {pageCount !== null ? `Pages: ${pageCount} · Credit cost` : "Credit cost"}
            </span>
            <span
              className="tr-estimate-cost"
              style={
                credits !== null && estimatedCredits !== null && credits < estimatedCredits
                  ? { color: "#e05a3a" }
                  : undefined
              }
            >
              {file
                ? estimatedCredits === null
                  ? "Estimating…"
                  : `${estimatedCredits} credit${estimatedCredits !== 1 ? "s" : ""}`
                : "—"}
            </span>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="error-msg" role="alert">⚠️ {errorMsg}</div>
          )}

          {/* Action buttons */}
          {isDone && downloadUrl ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <a href={downloadUrl} download={downloadName} className="tr-download-btn">
                ↓ Download translated file
              </a>
              <button onClick={reset} className="tr-reset-btn" type="button">
                Translate another file
              </button>
            </div>
          ) : (
            <button
              className="tr-translate-btn"
              onClick={handleTranslate}
              disabled={!file || isUploading}
              type="button"
            >
              {isUploading
                ? "Translating…"
                : selectedLang
                  ? `Translate to ${selectedLang.name} →`
                  : "Translate now →"}
            </button>
          )}

        </div>

        {/* RIGHT PANEL */}
        <div className="tr-right">

          {isUploading ? (
            /* Progress view during translation */
            <>
              <div className="tr-history-header">
                <span className="tr-history-title">Translating…</span>
              </div>
              <div className="tr-progress-panel">
                <div className="tr-progress-title">{stepText}</div>
                <div className="tr-progress-bar-wrap">
                  <div className="tr-progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="tr-steps-list" style={{ width: "100%", maxWidth: 320 }}>
                  {STEPS.map((step, i) => {
                    const currentStep = Math.min(Math.floor(progress / 20), STEPS.length - 1);
                    const done   = i < currentStep;
                    const active = i === currentStep;
                    return (
                      <div key={i} className={`tr-step-item${done ? " done" : active ? " active" : " pending"}`}>
                        <span className="tr-step-bullet" aria-hidden="true">
                          {done ? "✓" : active ? "✦" : "·"}
                        </span>
                        <span className="tr-step-label">{step}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* History view */
            <>
              <div className="tr-history-header">
                <span className="tr-history-title">Translation history</span>
                {history.length > 0 && (
                  <span className="tr-history-count">{history.length} document{history.length !== 1 ? "s" : ""}</span>
                )}
              </div>

              {history.length === 0 ? (
                <div className="tr-history-empty">
                  <div className="tr-history-empty-icon">📂</div>
                  <p className="tr-history-empty-text">
                    No translations yet — drop your first file to get started.
                  </p>
                </div>
              ) : (
                <div className="tr-history-list">
                  {history.map((item) => {
                    const lang = LANG_MAP[item.target_lang];
                    const isDocx = item.filename.toLowerCase().endsWith(".docx");
                    const date = new Date(item.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    });
                    return (
                      <div key={item.id} className="tr-history-row">
                        <span className="tr-history-icon" aria-hidden="true">
                          {isDocx ? "📝" : "📄"}
                        </span>
                        <div className="tr-history-info">
                          <div className="tr-history-name" title={item.filename}>
                            {item.filename}
                          </div>
                          <div className="tr-history-meta">
                            {lang ? `${lang.flag} ${lang.name}` : item.target_lang}
                            {" · "}
                            {item.credits_deducted} credit{item.credits_deducted !== 1 ? "s" : ""}
                            {" · "}
                            {date}
                          </div>
                        </div>
                        <button
                          className="tr-history-action"
                          type="button"
                          onClick={() => handleTranslateAgain(item.target_lang)}
                          title={`Translate another file to ${lang?.name ?? item.target_lang}`}
                        >
                          Translate again →
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

        </div>

      </main>

      {/* ── DOCUMENT READY MODAL ─────────────────────────────────────────── */}
      {modalDone && (
        <div
          className="ready-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalDone(false)}
        >
          <div className="ready-modal" onClick={(e) => e.stopPropagation()}>
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
            <div className="ready-icon-wrap" aria-hidden="true">
              <svg width="72" height="86" viewBox="0 0 30 36" fill="none">
                <path d="M3 0C1.34 0 0 1.34 0 3V33C0 34.66 1.34 36 3 36H27C28.66 36 30 34.66 30 33V9L21 0H3Z" fill="#d6e8d6"/>
                <path d="M21 0L30 9H21V0Z" fill="#b8d4b8"/>
                <rect x="6" y="15" width="18" height="2" rx="1" fill="#7aaa7a"/>
                <rect x="6" y="20" width="13" height="2" rx="1" fill="#7aaa7a"/>
                <rect x="6" y="25" width="15" height="2" rx="1" fill="#7aaa7a"/>
              </svg>
            </div>
            <h3>Translation complete!</h3>
            <p>Your translated file is ready — same layout, same branding, new language.</p>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={downloadName}
                className="btn-primary"
                style={{ margin: "0 auto 1rem", display: "inline-flex" }}
                onClick={() => setModalDone(false)}
              >
                ↓ Download file
              </a>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
