import { getBlogPosts } from "@/lib/notion";
import BlogClient from "./BlogClient";

// Revalidate every 60 seconds — new Notion posts appear within a minute
export const revalidate = 60;

export default async function BlogPage() {
  const posts = await getBlogPosts();
  return (
    <>
      <style>{BLOG_STYLES}</style>
      <BlogClient posts={posts} />
    </>
  );
}

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

.blog-section--featured { padding-top: 0; }
.blog-section--nl { padding-bottom: 6rem; }

/* ── Nav ── */
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

.blog-header-inner { max-width: 1100px; margin: 0 auto; }

.blog-header-eyebrow {
  font-size: 0.8rem; font-weight: 500;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--terracotta); margin-bottom: 1rem;
}

.blog-header-title {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: 400; line-height: 1.12;
  color: var(--ink); margin-bottom: 1.25rem; letter-spacing: -0.02em;
}

.blog-header-title em { font-style: italic; color: var(--terracotta); }

.blog-header-sub {
  font-size: 1rem; color: var(--ink-light);
  max-width: 540px; line-height: 1.65;
}

/* ── Featured post ── */
.blog-featured {
  display: grid; grid-template-columns: 1fr 280px; gap: 3rem;
  background: var(--warm-white); border: 1px solid var(--border);
  border-radius: 16px; padding: 2.75rem 3rem;
  margin-top: 3rem; position: relative; overflow: hidden;
}

.blog-featured::before {
  content: ''; position: absolute; top: 0; left: 0;
  width: 4px; height: 100%;
  background: var(--terracotta); border-radius: 4px 0 0 4px;
}

.blog-featured-inner { display: flex; flex-direction: column; gap: 1rem; }

.blog-featured-meta {
  display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
}

.blog-tag {
  font-size: 0.7rem; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  padding: 0.3rem 0.75rem; border-radius: 100px;
}

.blog-tag--featured { background: var(--terracotta); color: white; }

.blog-category-pill {
  font-size: 0.78rem; font-weight: 500;
  color: var(--sage); background: var(--sage-pale);
  padding: 0.28rem 0.75rem; border-radius: 100px;
}

.blog-category-pill--small { font-size: 0.72rem; padding: 0.22rem 0.6rem; }
.blog-meta-sep { color: var(--border); }
.blog-meta-text { font-size: 0.82rem; color: var(--ink-light); }
.blog-meta-text--small { font-size: 0.76rem; }

.blog-featured-title {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 400;
  line-height: 1.25; color: var(--ink); letter-spacing: -0.01em;
}

.blog-featured-excerpt { font-size: 0.95rem; color: var(--ink-light); line-height: 1.7; flex: 1; }

.blog-featured-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 1rem; border-top: 1px solid var(--border); margin-top: auto;
}

.blog-read-link {
  font-size: 0.88rem; font-weight: 500; color: var(--terracotta);
  text-decoration: none; display: inline-flex; align-items: center;
  gap: 0.3rem; transition: gap 0.2s;
}
.blog-read-link:hover { gap: 0.55rem; }

.blog-featured-illustration {
  display: flex; align-items: center; justify-content: center;
}

.blog-illustration-inner {
  position: relative; width: 160px; height: 160px;
  display: flex; align-items: center; justify-content: center;
}

.blog-ill-globe { animation: blog-spin 30s linear infinite; }

@keyframes blog-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.blog-ill-badge {
  position: absolute; bottom: 12px; right: 0;
  background: var(--terracotta); color: white;
  font-size: 0.7rem; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  padding: 0.3rem 0.7rem; border-radius: 100px;
}

/* ── Filters ── */
.blog-filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 2.5rem; }

.blog-filter-btn {
  font-family: var(--font-dm-sans), 'DM Sans', sans-serif;
  font-size: 0.85rem; font-weight: 400; color: var(--ink-light);
  background: transparent; border: 1px solid var(--border);
  border-radius: 100px; padding: 0.45rem 1.1rem;
  cursor: pointer; transition: all 0.18s;
}

.blog-filter-btn:hover { border-color: var(--ink-light); color: var(--ink); }
.blog-filter-btn--active { background: var(--ink); color: var(--cream); border-color: var(--ink); }

/* ── Post grid ── */
.blog-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }

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
  background: var(--warm-white); border: 1px solid var(--border);
  border-radius: 12px; padding: 1.75rem;
  display: flex; flex-direction: column; gap: 0.75rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

.blog-card:hover { transform: translateY(-3px); box-shadow: 0 8px 32px var(--shadow); }

.blog-card-top { display: flex; align-items: center; justify-content: space-between; }

.blog-card-title {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: 1.05rem; font-weight: 400; line-height: 1.35;
  color: var(--ink); letter-spacing: -0.01em; flex: 1;
}

.blog-card-excerpt {
  font-size: 0.85rem; color: var(--ink-light); line-height: 1.65; flex: 1;
  display: -webkit-box; -webkit-line-clamp: 3;
  -webkit-box-orient: vertical; overflow: hidden;
}

.blog-card-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 0.75rem; border-top: 1px solid var(--border); margin-top: auto;
}

.blog-card-link {
  font-size: 0.82rem; font-weight: 500; color: var(--terracotta);
  text-decoration: none; transition: gap 0.2s;
  display: inline-flex; align-items: center; gap: 0.25rem;
}
.blog-card-link:hover { gap: 0.45rem; }

.blog-empty {
  text-align: center; padding: 4rem 2rem; color: var(--ink-light);
  font-size: 0.95rem; border: 1px dashed var(--border); border-radius: 12px;
}

/* ── Newsletter ── */
.blog-newsletter {
  position: relative; background: var(--ink);
  border-radius: 20px; padding: 4rem; overflow: hidden; color: var(--cream);
}

.blog-newsletter-inner { position: relative; z-index: 1; max-width: 500px; }

.blog-newsletter-badge {
  display: inline-block; font-size: 0.7rem; font-weight: 600;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--terracotta); margin-bottom: 1.25rem;
}

.blog-newsletter-heading {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: clamp(1.75rem, 3.5vw, 2.5rem); font-weight: 400;
  line-height: 1.2; color: var(--cream);
  margin-bottom: 0.9rem; letter-spacing: -0.02em;
}

.blog-newsletter-sub { font-size: 0.92rem; color: rgba(250,247,242,0.65); line-height: 1.65; margin-bottom: 2rem; }

.blog-newsletter-form { display: flex; gap: 0.75rem; flex-wrap: wrap; }

.blog-newsletter-input {
  flex: 1; min-width: 220px; padding: 0.8rem 1.2rem;
  border-radius: 10px; border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.08); color: var(--cream);
  font-family: var(--font-dm-sans), 'DM Sans', sans-serif;
  font-size: 0.9rem; outline: none; transition: border-color 0.2s;
}

.blog-newsletter-input::placeholder { color: rgba(250,247,242,0.4); }
.blog-newsletter-input:focus { border-color: rgba(255,255,255,0.4); }

.blog-newsletter-btn {
  background: var(--terracotta); color: white; border: none;
  border-radius: 10px; padding: 0.8rem 1.6rem;
  font-family: var(--font-dm-sans), 'DM Sans', sans-serif;
  font-size: 0.9rem; font-weight: 500; cursor: pointer;
  transition: background 0.2s; display: flex;
  align-items: center; justify-content: center; min-width: 108px;
}

.blog-newsletter-btn:hover:not(:disabled) { background: var(--terracotta-light); }
.blog-newsletter-btn:disabled { opacity: 0.7; cursor: not-allowed; }

.blog-nl-spinner {
  display: inline-block; width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
  border-radius: 50%; animation: blog-spin 0.7s linear infinite;
}

.blog-newsletter-success {
  display: flex; align-items: center; gap: 0.6rem;
  font-size: 0.92rem; color: var(--cream);
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
  border-radius: 10px; padding: 0.9rem 1.2rem;
}

.blog-newsletter-disclaimer { margin-top: 0.9rem; font-size: 0.76rem; color: rgba(250,247,242,0.4); }

.blog-nl-deco { position: absolute; border-radius: 50%; pointer-events: none; }
.blog-nl-deco--1 {
  width: 320px; height: 320px; right: -60px; top: -80px;
  background: radial-gradient(circle, var(--terracotta) 0%, transparent 70%); opacity: 0.12;
}
.blog-nl-deco--2 {
  width: 200px; height: 200px; right: 120px; bottom: -60px;
  background: radial-gradient(circle, var(--sage) 0%, transparent 70%); opacity: 0.2;
}

@media (max-width: 600px) {
  .blog-newsletter { padding: 2.5rem 1.5rem; }
  .blog-newsletter-form { flex-direction: column; }
  .blog-newsletter-btn { width: 100%; }
}
`;
