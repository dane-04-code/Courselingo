"use client";

import { useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   BLOG DATA — edit these arrays to add / update posts and categories
───────────────────────────────────────────────────────────────────────────── */

const CATEGORIES = ["All", "Translation", "Course Creation", "Language Tips", "Business", "Tools"];

interface Post {
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  author: string;
  date: string;
  readTime: string;
  featured?: boolean;
  tag?: string;
}

const POSTS: Post[] = [
  {
    slug: "why-translated-courses-outperform",
    category: "Business",
    title: "Why Translated Courses Consistently Outperform English-Only Launches",
    excerpt:
      "Course creators who localise their materials into even one additional language report 40–70% higher completion rates and significantly better student reviews — here's the data behind why.",
    author: "CourseLingo Team",
    date: "Mar 24, 2026",
    readTime: "6 min read",
    featured: true,
    tag: "Must Read",
  },
  {
    slug: "preparing-pdfs-for-translation",
    category: "Translation",
    title: "How to Prepare Your PDFs for a Perfect Translation",
    excerpt:
      "Font embedding, bounding boxes, and image placement all affect how well your document translates. A five-minute pre-flight check can save hours of formatting cleanup.",
    author: "CourseLingo Team",
    date: "Mar 18, 2026",
    readTime: "4 min read",
  },
  {
    slug: "top-5-languages-2026",
    category: "Language Tips",
    title: "The 5 Languages Your Course Should Be In Before 2026 Ends",
    excerpt:
      "Spanish, Portuguese, French, German, and Japanese together unlock over 800 million potential learners. We break down which markets are growing fastest and why.",
    author: "CourseLingo Team",
    date: "Mar 12, 2026",
    readTime: "5 min read",
  },
  {
    slug: "deepl-vs-google-translate",
    category: "Tools",
    title: "DeepL vs Google Translate for Course Content — An Honest Comparison",
    excerpt:
      "We ran 50,000 words of course material through both services and measured readability scores, context retention, and formatting preservation. The results might surprise you.",
    author: "CourseLingo Team",
    date: "Mar 6, 2026",
    readTime: "8 min read",
  },
  {
    slug: "course-creation-layout-tips",
    category: "Course Creation",
    title: "Layout Principles That Survive Translation Without Reformatting",
    excerpt:
      "Text expansion — French adds ~20%, German up to 35% — breaks tight layouts. These design rules give your PDFs the breathing room to handle any target language gracefully.",
    author: "CourseLingo Team",
    date: "Feb 27, 2026",
    readTime: "5 min read",
  },
  {
    slug: "spanish-launch-case-study",
    category: "Business",
    title: "Case Study: 3× Revenue After a Spanish-Language Course Launch",
    excerpt:
      "One Kajabi creator added a Spanish edition of their signature programme in a weekend. Three months later their monthly revenue had tripled. We spoke to them about the process.",
    author: "CourseLingo Team",
    date: "Feb 19, 2026",
    readTime: "7 min read",
  },
  {
    slug: "hidden-cost-of-untranslated",
    category: "Business",
    title: "The Hidden Cost of Leaving Your Course in One Language",
    excerpt:
      "Opportunity cost is invisible — until you calculate it. We modelled the revenue left on the table by English-only course creators and the number is striking.",
    author: "CourseLingo Team",
    date: "Feb 10, 2026",
    readTime: "4 min read",
  },
  {
    slug: "docx-translation-guide",
    category: "Translation",
    title: "Translating DOCX Files: What Changes, What Stays, What to Watch",
    excerpt:
      "Tables, headers, footers, and text boxes each behave differently during translation. This guide walks through every DOCX element and how to handle it cleanly.",
    author: "CourseLingo Team",
    date: "Feb 3, 2026",
    readTime: "6 min read",
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENTS
───────────────────────────────────────────────────────────────────────────── */

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

function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setState("loading");
    // TODO: wire up to your email service (Mailchimp, Resend, etc.)
    await new Promise((r) => setTimeout(r, 900));
    setState("done");
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
            <button
              type="submit"
              className="blog-newsletter-btn"
              disabled={state === "loading"}
            >
              {state === "loading" ? (
                <span className="blog-nl-spinner" aria-hidden="true" />
              ) : (
                "Subscribe"
              )}
            </button>
          </form>
        )}
        <p className="blog-newsletter-disclaimer">
          No spam. Unsubscribe anytime.
        </p>
      </div>

      {/* Decorative background elements */}
      <div className="blog-nl-deco blog-nl-deco--1" aria-hidden="true" />
      <div className="blog-nl-deco blog-nl-deco--2" aria-hidden="true" />
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   PAGE
───────────────────────────────────────────────────────────────────────────── */

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState("All");

  const featured = POSTS.find((p) => p.featured)!;
  const rest = POSTS.filter((p) => !p.featured);

  const filtered =
    activeCategory === "All"
      ? rest
      : rest.filter((p) => p.category === activeCategory);

  return (
    <>
      <style>{BLOG_STYLES}</style>
      <Nav />

      <main className="blog-main">

        {/* ── Page header ── */}
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

        {/* ── Featured post ── */}
        <section className="blog-section blog-section--featured">
          <div className="blog-container">
            <FeaturedPost post={featured} />
          </div>
        </section>

        {/* ── Category filter + grid ── */}
        <section className="blog-section">
          <div className="blog-container">

            {/* Filter pills */}
            <div className="blog-filters" role="tablist" aria-label="Filter posts by category">
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

            {/* Post grid */}
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

        {/* ── Newsletter ── */}
        <section className="blog-section blog-section--nl">
          <div className="blog-container">
            <NewsletterSection />
          </div>
        </section>

      </main>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES
───────────────────────────────────────────────────────────────────────────── */

const BLOG_STYLES = `
/* ── Layout ── */
.blog-main {
  padding-top: 5rem;
  min-height: 100vh;
}

.blog-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 2rem;
}

.blog-section {
  padding: 4rem 0;
}

.blog-section--featured {
  padding-top: 0;
}

.blog-section--nl {
  padding-bottom: 6rem;
}

/* ── Nav override (same as site, blog link active) ── */
.blog-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.2rem 2rem;
  background: var(--cream);
  border-bottom: 1px solid var(--border);
}

/* ── Page header ── */
.blog-header {
  background: var(--cream);
  padding: 5rem 2rem 3rem;
  border-bottom: 1px solid var(--border);
}

.blog-header-inner {
  max-width: 1100px;
  margin: 0 auto;
}

.blog-header-eyebrow {
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--terracotta);
  margin-bottom: 1rem;
}

.blog-header-title {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: 400;
  line-height: 1.12;
  color: var(--ink);
  margin-bottom: 1.25rem;
  letter-spacing: -0.02em;
}

.blog-header-title em {
  font-style: italic;
  color: var(--terracotta);
}

.blog-header-sub {
  font-size: 1rem;
  color: var(--ink-light);
  max-width: 540px;
  line-height: 1.65;
}

/* ── Featured post ── */
.blog-featured {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 3rem;
  background: var(--warm-white);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2.75rem 3rem;
  margin-top: 3rem;
  position: relative;
  overflow: hidden;
}

.blog-featured::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 4px; height: 100%;
  background: var(--terracotta);
  border-radius: 4px 0 0 4px;
}

.blog-featured-inner {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.blog-featured-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.blog-tag {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.3rem 0.75rem;
  border-radius: 100px;
}

.blog-tag--featured {
  background: var(--terracotta);
  color: white;
}

.blog-category-pill {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--sage);
  background: var(--sage-pale);
  padding: 0.28rem 0.75rem;
  border-radius: 100px;
}

.blog-category-pill--small {
  font-size: 0.72rem;
  padding: 0.22rem 0.6rem;
}

.blog-meta-sep {
  color: var(--border);
}

.blog-meta-text {
  font-size: 0.82rem;
  color: var(--ink-light);
}

.blog-meta-text--small {
  font-size: 0.76rem;
}

.blog-featured-title {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 400;
  line-height: 1.25;
  color: var(--ink);
  letter-spacing: -0.01em;
}

.blog-featured-excerpt {
  font-size: 0.95rem;
  color: var(--ink-light);
  line-height: 1.7;
  flex: 1;
}

.blog-featured-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  margin-top: auto;
}

.blog-read-link {
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--terracotta);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  transition: gap 0.2s;
}

.blog-read-link:hover { gap: 0.55rem; }

.blog-featured-illustration {
  display: flex;
  align-items: center;
  justify-content: center;
}

.blog-illustration-inner {
  position: relative;
  width: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.blog-ill-globe {
  animation: blog-spin 30s linear infinite;
}

@keyframes blog-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.blog-ill-badge {
  position: absolute;
  bottom: 12px;
  right: 0;
  background: var(--terracotta);
  color: white;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.3rem 0.7rem;
  border-radius: 100px;
}

/* ── Filters ── */
.blog-filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 2.5rem;
}

.blog-filter-btn {
  font-family: var(--font-dm-sans), 'DM Sans', sans-serif;
  font-size: 0.85rem;
  font-weight: 400;
  color: var(--ink-light);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 100px;
  padding: 0.45rem 1.1rem;
  cursor: pointer;
  transition: all 0.18s;
}

.blog-filter-btn:hover {
  border-color: var(--ink-light);
  color: var(--ink);
}

.blog-filter-btn--active {
  background: var(--ink);
  color: var(--cream);
  border-color: var(--ink);
}

/* ── Post grid ── */
.blog-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
}

@media (max-width: 900px) {
  .blog-grid { grid-template-columns: repeat(2, 1fr); }
  .blog-featured { grid-template-columns: 1fr; }
  .blog-featured-illustration { display: none; }
}

@media (max-width: 600px) {
  .blog-grid { grid-template-columns: 1fr; }
  .blog-header { padding: 4rem 1.25rem 2rem; }
}

/* ── Post card ── */
.blog-card {
  background: var(--warm-white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

.blog-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 32px var(--shadow);
}

.blog-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.blog-card-title {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: 1.05rem;
  font-weight: 400;
  line-height: 1.35;
  color: var(--ink);
  letter-spacing: -0.01em;
  flex: 1;
}

.blog-card-excerpt {
  font-size: 0.85rem;
  color: var(--ink-light);
  line-height: 1.65;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.blog-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
  margin-top: auto;
}

.blog-card-link {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--terracotta);
  text-decoration: none;
  transition: gap 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.blog-card-link:hover { gap: 0.45rem; }

.blog-empty {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--ink-light);
  font-size: 0.95rem;
  border: 1px dashed var(--border);
  border-radius: 12px;
}

/* ── Newsletter ── */
.blog-newsletter {
  position: relative;
  background: var(--ink);
  border-radius: 20px;
  padding: 4rem;
  overflow: hidden;
  color: var(--cream);
}

.blog-newsletter-inner {
  position: relative;
  z-index: 1;
  max-width: 500px;
}

.blog-newsletter-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--terracotta);
  margin-bottom: 1.25rem;
}

.blog-newsletter-heading {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: clamp(1.75rem, 3.5vw, 2.5rem);
  font-weight: 400;
  line-height: 1.2;
  color: var(--cream);
  margin-bottom: 0.9rem;
  letter-spacing: -0.02em;
}

.blog-newsletter-sub {
  font-size: 0.92rem;
  color: rgba(250,247,242,0.65);
  line-height: 1.65;
  margin-bottom: 2rem;
}

.blog-newsletter-form {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.blog-newsletter-input {
  flex: 1;
  min-width: 220px;
  padding: 0.8rem 1.2rem;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.08);
  color: var(--cream);
  font-family: var(--font-dm-sans), 'DM Sans', sans-serif;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}

.blog-newsletter-input::placeholder {
  color: rgba(250,247,242,0.4);
}

.blog-newsletter-input:focus {
  border-color: rgba(255,255,255,0.4);
}

.blog-newsletter-btn {
  background: var(--terracotta);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0.8rem 1.6rem;
  font-family: var(--font-dm-sans), 'DM Sans', sans-serif;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 108px;
}

.blog-newsletter-btn:hover:not(:disabled) {
  background: var(--terracotta-light);
}

.blog-newsletter-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.blog-nl-spinner {
  display: inline-block;
  width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: blog-spin-nl 0.7s linear infinite;
}

@keyframes blog-spin-nl {
  to { transform: rotate(360deg); }
}

.blog-newsletter-success {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.92rem;
  color: var(--cream);
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  padding: 0.9rem 1.2rem;
}

.blog-newsletter-disclaimer {
  margin-top: 0.9rem;
  font-size: 0.76rem;
  color: rgba(250,247,242,0.4);
}

/* Decorative circles */
.blog-nl-deco {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.blog-nl-deco--1 {
  width: 320px; height: 320px;
  right: -60px; top: -80px;
  background: radial-gradient(circle, var(--terracotta) 0%, transparent 70%);
  opacity: 0.12;
}

.blog-nl-deco--2 {
  width: 200px; height: 200px;
  right: 120px; bottom: -60px;
  background: radial-gradient(circle, var(--sage) 0%, transparent 70%);
  opacity: 0.2;
}

@media (max-width: 600px) {
  .blog-newsletter { padding: 2.5rem 1.5rem; }
  .blog-newsletter-form { flex-direction: column; }
  .blog-newsletter-btn { width: 100%; }
}
`;
