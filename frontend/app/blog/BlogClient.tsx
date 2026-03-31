"use client";

import { useState } from "react";
import type { Post } from "@/lib/notion";

const CATEGORIES = ["All", "Translation", "Course Creation", "Language Tips", "Business", "Tools"];

/* ── Nav ── */
function Nav() {
  return (
    <nav className="blog-nav">
      <a href="/" className="logo">
        Course<span className="logo-dot">Lingo</span>
      </a>
      <ul className="nav-links">
        <li><a href="/#how-it-works">How it works</a></li>
        <li><a href="/#pricing">Pricing</a></li>
        <li><a href="/blog" style={{ color: "var(--ink)", fontWeight: 500 }}>Blog</a></li>
        <li><a href="/login">Sign in</a></li>
        <li><a href="/signup" className="nav-cta">Get started</a></li>
      </ul>
    </nav>
  );
}

/* ── Featured post ── */
function FeaturedPost({ post }: { post: Post }) {
  return (
    <article className="blog-featured">
      <div className="blog-featured-inner">
        <div className="blog-featured-meta">
          {post.tag && <span className="blog-tag blog-tag--featured">{post.tag}</span>}
          <span className="blog-category-pill">{post.category}</span>
          <span className="blog-meta-sep">·</span>
          <span className="blog-meta-text">{post.readTime}</span>
        </div>
        <h2 className="blog-featured-title">{post.title}</h2>
        <p className="blog-featured-excerpt">{post.excerpt}</p>
        <div className="blog-featured-footer">
          <span className="blog-meta-text">{post.date}</span>
          <a href={`/blog/${post.slug}`} className="blog-read-link">
            Read article <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
      <div className="blog-featured-illustration" aria-hidden="true">
        <div className="blog-illustration-inner">
          <div className="blog-ill-globe">
            <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" width="120" height="120">
              <circle cx="60" cy="60" r="55" stroke="var(--terracotta)" strokeWidth="1.5" opacity="0.3"/>
              <circle cx="60" cy="60" r="38" stroke="var(--terracotta)" strokeWidth="1.5" opacity="0.5"/>
              <circle cx="60" cy="60" r="20" fill="var(--terracotta)" opacity="0.15"/>
              <line x1="5" y1="60" x2="115" y2="60" stroke="var(--terracotta)" strokeWidth="1" opacity="0.4"/>
              <line x1="60" y1="5" x2="60" y2="115" stroke="var(--terracotta)" strokeWidth="1" opacity="0.4"/>
              <ellipse cx="60" cy="60" rx="22" ry="55" stroke="var(--terracotta)" strokeWidth="1" opacity="0.3"/>
              <ellipse cx="60" cy="60" rx="40" ry="55" stroke="var(--terracotta)" strokeWidth="1" opacity="0.2"/>
            </svg>
          </div>
          <div className="blog-ill-badge">Featured</div>
        </div>
      </div>
    </article>
  );
}

/* ── Post card ── */
function PostCard({ post }: { post: Post }) {
  return (
    <article className="blog-card">
      <div className="blog-card-top">
        <span className="blog-category-pill blog-category-pill--small">{post.category}</span>
        <span className="blog-meta-text blog-meta-text--small">{post.readTime}</span>
      </div>
      <h3 className="blog-card-title">{post.title}</h3>
      <p className="blog-card-excerpt">{post.excerpt}</p>
      <div className="blog-card-footer">
        <span className="blog-meta-text blog-meta-text--small">{post.date}</span>
        <a href={`/blog/${post.slug}`} className="blog-card-link">
          Read <span aria-hidden="true">→</span>
        </a>
      </div>
    </article>
  );
}

/* ── Newsletter ── */
function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState("error");
        setErrorMsg(data.error || "Something went wrong.");
        return;
      }

      setState("done");
    } catch {
      setState("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  return (
    <section className="blog-newsletter">
      <div className="blog-newsletter-inner">
        <div className="blog-newsletter-badge">Newsletter</div>
        <h2 className="blog-newsletter-heading">
          Translation tips, straight<br />to your inbox.
        </h2>
        <p className="blog-newsletter-sub">
          No fluff. Just practical guides on translating course materials, growing into new markets, and using AI tools that actually work.
        </p>

        {state === "done" ? (
          <div className="blog-newsletter-success">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="10" fill="var(--sage)"/>
              <path d="M6 10.5L8.5 13L14 7.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            You&apos;re on the list — look out for our next issue.
          </div>
        ) : (
          <>
            <form className="blog-newsletter-form" onSubmit={handleSubmit}>
              <input
                type="email"
                className="blog-newsletter-input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={state === "loading"}
                aria-label="Email address"
              />
              <button type="submit" className="blog-newsletter-btn" disabled={state === "loading"}>
                {state === "loading" ? <span className="blog-nl-spinner" aria-hidden="true" /> : "Subscribe"}
              </button>
            </form>
            {state === "error" && (
              <p style={{ color: "#ff9b8a", fontSize: "0.85rem", marginTop: "0.75rem" }}>{errorMsg}</p>
            )}
          </>
        )}
        <p className="blog-newsletter-disclaimer">No spam. Unsubscribe anytime.</p>
      </div>
      <div className="blog-nl-deco blog-nl-deco--1" aria-hidden="true" />
      <div className="blog-nl-deco blog-nl-deco--2" aria-hidden="true" />
    </section>
  );
}

/* ── Main client component ── */
export default function BlogClient({ posts }: { posts: Post[] }) {
  const [activeCategory, setActiveCategory] = useState("All");

  const featured = posts.find((p) => p.featured);
  const rest = posts.filter((p) => !p.featured);
  const filtered = activeCategory === "All" ? rest : rest.filter((p) => p.category === activeCategory);

  return (
    <>
      <Nav />
      <main className="blog-main">

        {/* Page header */}
        <header className="blog-header">
          <div className="blog-header-inner">
            <p className="blog-header-eyebrow">The CourseLingo Blog</p>
            <h1 className="blog-header-title">
              Insights for course<br />
              <em>creators going global.</em>
            </h1>
            <p className="blog-header-sub">
              Translation strategy, layout tips, language market data, and real creator stories — everything you need to take your course worldwide.
            </p>
          </div>
        </header>

        {/* Featured post */}
        {featured && (
          <section className="blog-section blog-section--featured">
            <div className="blog-container">
              <FeaturedPost post={featured} />
            </div>
          </section>
        )}

        {/* Category filter + grid */}
        <section className="blog-section">
          <div className="blog-container">
            <div className="blog-filters" role="tablist" aria-label="Filter by category">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  role="tab"
                  aria-selected={activeCategory === cat}
                  className={`blog-filter-btn${activeCategory === cat ? " blog-filter-btn--active" : ""}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            {filtered.length > 0 ? (
              <div className="blog-grid">
                {filtered.map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>
            ) : (
              <div className="blog-empty">
                No posts in this category yet — check back soon.
              </div>
            )}
          </div>
        </section>

        {/* Newsletter */}
        <section className="blog-section blog-section--nl">
          <div className="blog-container">
            <NewsletterSection />
          </div>
        </section>

      </main>
    </>
  );
}
