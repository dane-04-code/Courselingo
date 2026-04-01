# Profile Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact profile dropdown that appears when the user clicks their avatar, replacing the standalone Sign out link, and showing email, credit balance, and a top-up link.

**Architecture:** A new `ProfilePopup.tsx` client component manages its own open/close state and receives `email`, `credits`, and `onSignOut` as props. The existing `translator/page.tsx` swaps out the avatar div + signout button for this single component. Styles are added to `globals.css`.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, CSS custom properties

---

### Task 1: Add popup CSS to globals.css

**Files:**
- Modify: `frontend/app/globals.css` — add profile popup styles after `.signout-link:hover` (line 1030)

- [ ] **Step 1: Add styles after the `.signout-link:hover` block**

Open `frontend/app/globals.css`. After line 1030 (the closing `}` of `.signout-link:hover`), insert:

```css
/* ─── Profile Popup ──────────────────────────────────────────────────────── */

.user-avatar {
  cursor: pointer;
}

.profile-popup-wrapper {
  position: relative;
  display: inline-block;
}

.profile-popup {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 240px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  z-index: 200;
  overflow: hidden;
}

.profile-popup-header {
  padding: 0.9rem 1rem;
  background: var(--cream);
  border-bottom: 1px solid var(--border);
}

.profile-popup-email {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--ink);
  word-break: break-all;
}

.profile-popup-credits-section {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.profile-popup-credits-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.profile-popup-credits-label {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--sage);
}

.profile-popup-credits-num {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1;
}

.profile-popup-topup {
  font-size: 0.72rem;
  font-weight: 600;
  color: white;
  background: var(--terracotta);
  border-radius: 6px;
  padding: 0.3rem 0.7rem;
  text-decoration: none;
  transition: background 0.15s;
  flex-shrink: 0;
}

.profile-popup-topup:hover {
  background: #b05a42;
}

.profile-popup-actions {
  padding: 0.5rem;
}

.profile-popup-signout {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.45rem 0.6rem;
  font-size: 0.78rem;
  color: var(--terracotta);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s;
}

.profile-popup-signout:hover {
  background: var(--cream);
}
```

- [ ] **Step 2: Verify the existing `.user-avatar` cursor is overridden**

The existing `.user-avatar` rule at line 1010 has `cursor: default`. The new rule `.user-avatar { cursor: pointer; }` added above overrides it because it appears later in the file. No other change needed.

- [ ] **Step 3: Commit**

```bash
cd frontend && npm run lint
```

Expected: no errors relating to globals.css (lint doesn't check CSS, this just confirms the frontend still compiles).

```bash
cd .. && git add frontend/app/globals.css && git commit -m "style: add profile popup CSS"
```

---

### Task 2: Create ProfilePopup component

**Files:**
- Create: `frontend/app/translator/ProfilePopup.tsx`

- [ ] **Step 1: Create the file**

Create `frontend/app/translator/ProfilePopup.tsx` with this content:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface ProfilePopupProps {
  email: string;
  credits: number | null;
  onSignOut: () => void;
}

export default function ProfilePopup({ email, credits, onSignOut }: ProfilePopupProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const initials = email ? email.slice(0, 2).toUpperCase() : "?";

  return (
    <div className="profile-popup-wrapper" ref={wrapperRef}>
      <div
        className="user-avatar"
        role="button"
        tabIndex={0}
        title={email}
        aria-label="Profile menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <span>{initials}</span>
      </div>

      {open && (
        <div className="profile-popup" role="menu">
          <div className="profile-popup-header">
            <div className="profile-popup-email">{email}</div>
          </div>
          <div className="profile-popup-credits-section">
            <div className="profile-popup-credits-info">
              <div className="profile-popup-credits-label">Credits remaining</div>
              <div className="profile-popup-credits-num">
                {credits === null ? "—" : credits}
              </div>
            </div>
            <a
              href="/#pricing"
              className="profile-popup-topup"
              onClick={() => setOpen(false)}
            >
              Top up →
            </a>
          </div>
          <div className="profile-popup-actions">
            <button
              className="profile-popup-signout"
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              ↪ Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run lint to verify the file is valid TypeScript**

```bash
cd frontend && npm run lint
```

Expected: no errors in `app/translator/ProfilePopup.tsx`.

- [ ] **Step 3: Commit**

```bash
cd .. && git add frontend/app/translator/ProfilePopup.tsx && git commit -m "feat: add ProfilePopup component"
```

---

### Task 3: Wire ProfilePopup into translator/page.tsx

**Files:**
- Modify: `frontend/app/translator/page.tsx`

- [ ] **Step 1: Add the import**

At the top of `frontend/app/translator/page.tsx`, after the existing imports, add:

```tsx
import ProfilePopup from "./ProfilePopup";
```

- [ ] **Step 2: Replace the header avatar + sign out JSX**

Find this block (lines 337–349):

```tsx
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
```

Replace it with:

```tsx
        <div className="translator-header-right">
          <ProfilePopup
            email={user?.email ?? ""}
            credits={credits}
            onSignOut={handleSignOut}
          />
        </div>
```

- [ ] **Step 3: Run lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Start the dev servers:

```bash
# Terminal 1
cd backend && .venv/Scripts/activate && uvicorn main:app --reload

# Terminal 2
cd frontend && npm run dev
```

Open `http://localhost:3000`, sign in, go to `/translator`. Verify:
1. The "Sign out" link is gone from the header
2. The avatar circle is clickable
3. Clicking the avatar opens the popup showing email, credit count, "Top up →" link, and "↪ Sign out"
4. Clicking outside the popup closes it
5. Pressing Escape closes it
6. "Top up →" navigates to `/#pricing`
7. "↪ Sign out" signs you out and redirects to `/`

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/app/translator/page.tsx && git commit -m "feat: wire ProfilePopup into translator header"
```

---

### Task 4: Push to production

- [ ] **Step 1: Push to trigger Vercel deploy**

```bash
git push origin main
```

- [ ] **Step 2: Verify on production**

Once Vercel deploys, open the live site, sign in, and repeat the smoke test from Task 3 Step 4 on the production URL.
