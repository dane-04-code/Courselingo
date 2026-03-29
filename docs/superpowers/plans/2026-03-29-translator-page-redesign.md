# Translator Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the narrow single-column translator page with a split-workspace layout: left panel (upload tool + credit balance), right panel (scrollable metadata-only translation history).

**Architecture:** The translator page gets a two-panel layout filling the full viewport. Left panel is fixed-width with the upload tool, credit balance card, and credit cost estimate. Right panel scrolls independently and shows translation history fetched from Supabase `translation_history`. During translation, the right panel temporarily shows progress steps. No files are stored — history is metadata only.

**Tech Stack:** Next.js 14 (App Router, client component), Supabase browser client, FastAPI (Python), PyMuPDF, python-docx, existing CSS variable theme.

---

### Task 1: Add `/estimate` endpoint to backend

**Files:**
- Modify: `backend/main.py` (after the existing `/translate` route)

- [ ] **Step 1: Add `_chars_to_credits` helper after the existing `_handle_docx` function**

Open `backend/main.py`. After the `_handle_docx` function (search for it), add:

```python
def _chars_to_credits(n: int) -> int:
    """Map character count to credit cost using agreed tier thresholds."""
    if n <= 20_000:  return 1
    if n <= 60_000:  return 2
    if n <= 120_000: return 4
    return 6
```

- [ ] **Step 2: Add the `/estimate` route after the `/health` route**

Search for `@app.get("/health")` in `main.py`. After that entire health endpoint block, add:

```python
@app.post("/estimate")
async def estimate_characters(file: UploadFile = File(...)):
    """Return character count and credit cost for a file without translating it."""
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 20 MB limit.")

    name = (file.filename or "").lower()

    if name.endswith(".pdf"):
        import fitz
        try:
            doc = fitz.open(stream=content, filetype="pdf")
            total_chars = sum(
                len(b[4])
                for page in doc
                for b in page.get_text("blocks")
                if b[6] == 0  # 0 = text block, 1 = image block
            )
            doc.close()
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to read PDF: {exc}")

    elif name.endswith(".docx"):
        from docx import Document
        import io
        try:
            doc = Document(io.BytesIO(content))
            total_chars = sum(len(p.text) for p in doc.paragraphs)
            for table in doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        total_chars += len(cell.text)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to read DOCX: {exc}")

    else:
        raise HTTPException(
            status_code=400,
            detail="Only PDF and DOCX files are supported.",
        )

    return {
        "char_count": total_chars,
        "credits_required": _chars_to_credits(total_chars),
    }
```

- [ ] **Step 3: Verify the endpoint works**

Start the backend if not running:
```bash
cd backend && .venv/Scripts/uvicorn.exe main:app --reload
```

In a separate terminal, test with curl (use any small PDF you have):
```bash
curl -X POST http://127.0.0.1:8000/estimate \
  -F "file=@path/to/any.pdf"
```
Expected response: `{"char_count": <number>, "credits_required": <1|2|4|6>}`

Also verify health still works: `curl http://127.0.0.1:8000/health` → `{"status":"ok"}`

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat: add /estimate endpoint for credit cost preview"
```

---

### Task 2: Add split-layout CSS to globals.css

**Files:**
- Modify: `frontend/app/globals.css`

The existing `.translator-main` class at line ~869 uses `justify-content: center; padding: 3.5rem 2rem 5rem`. We need to override it for the split layout and add all new panel/history classes.

- [ ] **Step 1: Override `.translator-main` for the split layout**

Find `.translator-main` in `globals.css` (around line 869). Replace the existing block:

```css
.translator-main {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 3.5rem 2rem 5rem;
}
```

with:

```css
.translator-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}
```

- [ ] **Step 2: Append all new split-layout classes to the end of globals.css**

Add the following block at the very end of `globals.css`:

```css
/* ─── TRANSLATOR SPLIT LAYOUT ────────────────────────────────────────────── */

.tr-left {
  width: 360px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 1.75rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  background: var(--cream);
}

.tr-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--warm-white);
}

/* ── Credit card ── */
.tr-credit-card {
  background: var(--sage-pale);
  border: 1px solid #C8DBC8;
  border-radius: 12px;
  padding: 0.9rem 1.1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.tr-credit-left { display: flex; flex-direction: column; gap: 2px; }

.tr-credit-label {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--sage);
}

.tr-credit-amount {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: 1.9rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1;
}

.tr-credit-buy {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--terracotta);
  text-decoration: none;
  background: white;
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 0.4rem 0.85rem;
  white-space: nowrap;
  transition: all 0.18s;
  flex-shrink: 0;
}

.tr-credit-buy:hover {
  background: var(--terracotta);
  color: white;
  border-color: var(--terracotta);
}

/* ── Left heading ── */
.tr-left-heading {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.tr-left-eyebrow {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--sage);
}

.tr-left-title {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.2;
}

/* ── Estimate row ── */
.tr-estimate-row {
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  font-size: 0.82rem;
  color: var(--ink-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
}

.tr-estimate-cost {
  font-weight: 600;
  color: var(--ink);
}

/* ── Translate / download / reset buttons ── */
.tr-translate-btn {
  background: var(--terracotta);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0.85rem 1.5rem;
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.18s;
  width: 100%;
  text-align: center;
}

.tr-translate-btn:hover:not(:disabled) { background: #b05a42; }
.tr-translate-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.tr-download-btn {
  background: var(--sage);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0.85rem 1.5rem;
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.18s;
  width: 100%;
  text-decoration: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}

.tr-download-btn:hover { background: #4a6a4a; }

.tr-reset-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--ink-light);
  border-radius: 10px;
  padding: 0.65rem 1.5rem;
  font-family: inherit;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.18s;
  width: 100%;
}

.tr-reset-btn:hover { border-color: var(--ink-light); color: var(--ink); }

/* ── History panel (right side) ── */
.tr-history-header {
  padding: 1.1rem 1.5rem 0.9rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  background: var(--warm-white);
}

.tr-history-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--ink);
}

.tr-history-count {
  font-size: 0.72rem;
  color: var(--ink-light);
}

.tr-history-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tr-history-row {
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.6rem 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  transition: border-color 0.15s;
}

.tr-history-row:hover { border-color: var(--ink-light); }

.tr-history-icon { font-size: 1rem; flex-shrink: 0; line-height: 1; }

.tr-history-info { flex: 1; min-width: 0; }

.tr-history-name {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tr-history-meta {
  font-size: 0.7rem;
  color: var(--ink-light);
  margin-top: 1px;
}

.tr-history-action {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--terracotta);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  padding: 0.28rem 0.55rem;
  border-radius: 6px;
  transition: background 0.15s;
  flex-shrink: 0;
}

.tr-history-action:hover { background: rgba(196,104,79,0.08); }

.tr-history-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 3rem 2rem;
  text-align: center;
}

.tr-history-empty-icon { font-size: 2.2rem; opacity: 0.35; }

.tr-history-empty-text {
  font-size: 0.85rem;
  color: var(--ink-light);
  line-height: 1.55;
  max-width: 240px;
}

/* ── Progress panel (right side during translation) ── */
.tr-progress-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 2rem;
}

.tr-progress-title {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink);
}

.tr-progress-bar-wrap {
  width: 100%;
  max-width: 300px;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.tr-progress-bar-fill {
  height: 100%;
  background: var(--terracotta);
  border-radius: 2px;
  transition: width 0.4s ease;
}

/* ── Mobile ── */
@media (max-width: 768px) {
  .translator-main {
    flex-direction: column;
    overflow: visible;
  }
  .tr-left {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
  .tr-right {
    min-height: 360px;
  }
}
```

- [ ] **Step 3: Verify the dev server compiles without errors**

```bash
cd frontend && npm run dev
```

Expected: `✓ Ready in Xs` with no TypeScript/CSS errors. The translator page at `http://localhost:3001/translator` will look broken at this point — that's expected until Task 3.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat: add split-layout CSS for translator page redesign"
```

---

### Task 3: Rewrite translator page

**Files:**
- Modify: `frontend/app/translator/page.tsx`

This task replaces the render section entirely. All existing logic functions (`handleFile`, `handleTranslate`, `startFakeProgress`, `reset`, etc.) are kept unchanged. We add new state, new effects, and a new render tree.

**Context on the existing page:**
- `LANGUAGES` array: `{ code: string, flag: string, name: string }[]`
- `API_URL = "http://127.0.0.1:8000"`
- `Status = "idle" | "uploading" | "done" | "error"`
- `supabase = createClient()` (Supabase browser client, already imported)
- `user` state is already fetched via `supabase.auth.getUser()`

- [ ] **Step 1: Add `HistoryItem` type and `LANG_MAP` constant after the `STEPS` constant**

Find `const STEPS = [` near the top of the file. Directly after the closing `];` of STEPS, add:

```typescript
interface HistoryItem {
  id: string;
  filename: string;
  target_lang: string;
  credits_deducted: number;
  created_at: string;
}

const LANG_MAP = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]));
```

- [ ] **Step 2: Add new state variables inside the component**

Find the existing state declarations block (the section with `const [file, setFile]`, `const [language, setLanguage]`, etc.). After the existing state declarations and before the `inputRef` declarations, add:

```typescript
const [history, setHistory]               = useState<HistoryItem[]>([]);
const [credits, setCredits]               = useState<number | null>(null);
const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
```

- [ ] **Step 3: Add `fetchCreditsAndHistory` callback**

Find the `reset` callback. Directly before it, add:

```typescript
const fetchCreditsAndHistory = useCallback(async () => {
  const { data: { user: u } } = await supabase.auth.getUser();
  if (!u) return;

  const [creditsRes, historyRes] = await Promise.all([
    supabase
      .from("user_credits")
      .select("credits_remaining")
      .eq("user_id", u.id)
      .single(),
    supabase
      .from("translation_history")
      .select("id, filename, target_lang, credits_deducted, created_at")
      .eq("user_id", u.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (creditsRes.data) setCredits(creditsRes.data.credits_remaining);
  if (historyRes.data) setHistory(historyRes.data);
}, [supabase]);
```

- [ ] **Step 4: Add mount effect and estimate effect**

Find the existing `useEffect` that calls `supabase.auth.getUser()` (sets `user` state). Directly after that effect's closing `}, []);`, add these two new effects:

```typescript
// Fetch credits + history on mount
useEffect(() => {
  fetchCreditsAndHistory();
}, [fetchCreditsAndHistory]);

// Estimate credit cost whenever a new file is selected
useEffect(() => {
  if (!file) { setEstimatedCredits(null); return; }
  const controller = new AbortController();
  const form = new FormData();
  form.append("file", file);
  fetch(`${API_URL}/estimate`, {
    method: "POST",
    body: form,
    signal: controller.signal,
  })
    .then((r) => r.json())
    .then((d) => setEstimatedCredits(d.credits_required ?? null))
    .catch(() => {}); // best-effort — don't block the UI
  return () => controller.abort();
}, [file]);
```

- [ ] **Step 5: Add `handleTranslateAgain` callback**

Directly after the `reset` callback, add:

```typescript
const handleTranslateAgain = useCallback((langCode: string) => {
  setLanguage(langCode);
  reset();
}, [reset]);
```

- [ ] **Step 6: Call `fetchCreditsAndHistory` after a successful translation**

Find the line inside `handleTranslate` that reads:
```typescript
setTimeout(() => setModalDone(true), 600);
```

Replace it with:
```typescript
setTimeout(() => setModalDone(true), 600);
fetchCreditsAndHistory();
```

Note: `fetchCreditsAndHistory` needs to be in the dependency array of `handleTranslate`. Find the `}, [file, language, startFakeProgress]);` at the end of `handleTranslate` and change it to:
```typescript
}, [file, language, startFakeProgress, fetchCreditsAndHistory]);
```

- [ ] **Step 7: Replace the entire render return with the new split layout**

Find the comment `/* ─── derived ─── */` near the bottom of the component (around line 237). Replace everything from that comment down to and including the final `);` of the component with:

```tsx
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
            <span>Credit cost</span>
            <span className="tr-estimate-cost">
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
```

- [ ] **Step 8: Verify the page renders correctly**

With the dev server running, open `http://localhost:3001/translator` (log in if needed).

Check:
- Left panel is visible with credit balance (shows "—" until Supabase returns data), upload box, language selector, estimate row, translate button
- Right panel shows "No translations yet" if you haven't translated anything, or history rows if you have
- Dropping a file shows the filename + triggers "Estimating…" then the credit count
- Clicking Translate shows progress steps in the right panel
- After translation, right panel returns to history with the new item at top; download + reset appear in left panel

- [ ] **Step 9: Commit**

```bash
git add frontend/app/translator/page.tsx
git commit -m "feat: redesign translator page with split-workspace layout and history panel"
```
