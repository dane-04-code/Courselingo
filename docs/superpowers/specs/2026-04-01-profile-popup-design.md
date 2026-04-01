# Profile Popup — Design Spec

**Date:** 2026-04-01

## Overview

A compact dropdown popup anchored to the user avatar in the translator header. Replaces the standalone "Sign out" link. Gives signed-in users a quick view of their email, credit balance, and account actions without leaving the translator page.

## Trigger

- The avatar circle (`user-avatar`) in `translator-header-right` is the sole interactive element in that area.
- The existing `signout-link` button is **removed** from the header.
- Clicking the avatar toggles the popup open/closed.
- Clicking anywhere outside the popup closes it (click-away listener using `useEffect` + `mousedown` event).

## Popup Contents

1. **Email** — user's email address (already fetched via `supabase.auth.getUser()`)
2. **Credits remaining** — large number pulled from the existing `credits` state
3. **Top up →** button — links to `/#pricing`
4. **Sign out** — calls `supabase.auth.signOut()` then redirects to `/`

No plan level displayed.

## Visual Design

- Style: compact dropdown (Option A from brainstorm)
- Anchors **below and right-aligned** to the avatar button
- `position: absolute` on the popup, `position: relative` on the avatar wrapper
- Uses existing CSS variables: `--cream`, `--ink`, `--ink-light`, `--sage`, `--sage-pale`, `--sage-light`, `--terracotta`, `--border`
- Box shadow: `0 8px 32px rgba(0,0,0,0.12)`
- Border radius: 12px
- Width: ~240px

## Architecture

### New file: `frontend/app/translator/ProfilePopup.tsx`

A `"use client"` component. Accepts:

```ts
interface ProfilePopupProps {
  email: string;
  credits: number | null;
  onSignOut: () => void;
}
```

Manages its own `open` boolean state internally. Renders the avatar button + popup as a single self-contained unit with a relative-positioned wrapper.

### Modified: `frontend/app/translator/page.tsx`

- Remove `signout-link` button JSX and `handleSignOut` function
- Remove standalone `user-avatar` div
- Import and render `<ProfilePopup email={...} credits={...} onSignOut={...} />`
- Pass `handleSignOut` logic as the `onSignOut` prop (inline or extracted)

### Modified: `frontend/app/globals.css`

Add styles for:
- `.profile-popup-wrapper` — `position: relative; display: inline-block`
- `.profile-popup` — absolute positioned card
- `.profile-popup-email`, `.profile-popup-credits-label`, `.profile-popup-credits-num`
- `.profile-popup-topup` — terracotta link/button
- `.profile-popup-signout` — muted action row

## Data Flow

`translator/page.tsx` already fetches `credits` and `user` (email) on mount. These are passed down as props — no additional data fetching needed in the popup component.

## Error / Edge Cases

- If `credits` is `null` (still loading), show `—` in place of the number.
- If `email` is undefined, show nothing in the email row.
- Popup closes on sign-out click before the async sign-out completes (optimistic close).
