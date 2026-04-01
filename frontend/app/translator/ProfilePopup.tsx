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
