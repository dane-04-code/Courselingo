import { notFound } from "next/navigation";
import { getBlogPost, getPageBlocks, Block } from "@/lib/notion";
import type { Metadata } from "next";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getBlogPost(params.slug);
  if (!post) return { title: "Not Found" };
  return { title: `${post.title} — CourseLingo Blog`, description: post.excerpt };
}

/* ── Rich text renderer ── */
function RichText({ richText }: { richText: Block["richText"] }) {
  if (!richText?.length) return null;
  return (
    <>
      {richText.map((chunk, i) => {
        let node: React.ReactNode = chunk.plain_text;
        if (chunk.annotations?.bold)   node = <strong key={i}>{node}</strong>;
        if (chunk.annotations?.italic) node = <em key={i}>{node}</em>;
        if (chunk.annotations?.code)   node = <code key={i} className="bpost-inline-code">{node}</code>;
        if (chunk.href)                node = <a key={i} href={chunk.href} className="bpost-link" target="_blank" rel="noopener noreferrer">{node}</a>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

/* ── Block renderer ── */
function renderBlocks(blocks: Block[]) {
  const elements: React.ReactNode[] = [];
  let listBuffer: Block[] = [];
  let listType: "bulleted" | "numbered" | null = null;

  function flushList() {
    if (!listBuffer.length) return;
    const Tag = listType === "numbered" ? "ol" : "ul";
    elements.push(
      <Tag key={`list-${elements.length}`} className={`bpost-list${listType === "numbered" ? " bpost-list--ordered" : ""}`}>
        {listBuffer.map((b, i) => (
          <li key={i} className="bpost-list-item">
            <RichText richText={b.richText} />
          </li>
        ))}
      </Tag>
    );
    listBuffer = [];
    listType = null;
  }

  for (const block of blocks) {
    const isBullet   = block.type === "bulleted_list_item";
    const isNumbered = block.type === "numbered_list_item";

    if (isBullet || isNumbered) {
      const current = isBullet ? "bulleted" : "numbered";
      if (listType && listType !== current) flushList();
      listType = current;
      listBuffer.push(block);
      continue;
    }

    flushList();

    switch (block.type) {
      case "heading_1":
        elements.push(<h2 key={elements.length} className="bpost-h1"><RichText richText={block.richText} /></h2>);
        break;
      case "heading_2":
        elements.push(<h3 key={elements.length} className="bpost-h2"><RichText richText={block.richText} /></h3>);
        break;
      case "heading_3":
        elements.push(<h4 key={elements.length} className="bpost-h3"><RichText richText={block.richText} /></h4>);
        break;
      case "paragraph":
        if (block.text) elements.push(<p key={elements.length} className="bpost-p"><RichText richText={block.richText} /></p>);
        break;
      case "quote":
        elements.push(<blockquote key={elements.length} className="bpost-quote"><RichText richText={block.richText} /></blockquote>);
        break;
      case "callout":
        elements.push(
          <div key={elements.length} className="bpost-callout">
            <span className="bpost-callout-icon" aria-hidden="true">{block.icon}</span>
            <p>{block.text}</p>
          </div>
        );
        break;
      case "code":
        elements.push(
          <div key={elements.length} className="bpost-code-wrap">
            {block.language && block.language !== "plain text" && (
              <div className="bpost-code-lang">{block.language}</div>
            )}
            <pre className="bpost-code"><code>{block.text}</code></pre>
          </div>
        );
        break;
      case "image":
        if (block.url) elements.push(
          <figure key={elements.length} className="bpost-figure">
            <img src={block.url} alt={block.caption || ""} className="bpost-img" loading="lazy" />
            {block.caption && <figcaption className="bpost-figcaption">{block.caption}</figcaption>}
          </figure>
        );
        break;
      case "divider":
        elements.push(<hr key={elements.length} className="bpost-divider" />);
        break;
    }
  }

  flushList();
  return elements;
}

/* ── Page ── */
export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getBlogPost(params.slug);
  if (!post || !post.pageId) notFound();

  const blocks = await getPageBlocks(post.pageId);

  return (
    <>
      <style>{POST_STYLES}</style>

      {/* Nav */}
      <nav className="blog-nav">
        <a href="/" className="logo">Course<span className="logo-dot">Lingo</span></a>
        <ul className="nav-links">
          <li><a href="/#how">How it works</a></li>
          <li><a href="/#pricing">Pricing</a></li>
          <li><a href="/blog" style={{ color: "var(--ink)", fontWeight: 500 }}>Blog</a></li>
          <li><a href="/login">Sign in</a></li>
          <li><a href="/signup" className="nav-cta">Get started</a></li>
        </ul>
      </nav>

      <main className="bpost-main">

        {/* Hero */}
        <header className="bpost-hero">
          <div className="bpost-hero-inner">
            <a href="/blog" className="bpost-back">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              All articles
            </a>
            <div className="bpost-hero-meta">
              <span className="blog-category-pill">{post.category}</span>
              <span className="bpost-meta-dot">·</span>
              <span className="bpost-meta-text">{post.readTime}</span>
              <span className="bpost-meta-dot">·</span>
              <span className="bpost-meta-text">{post.date}</span>
            </div>
            <h1 className="bpost-title">{post.title}</h1>
            {post.excerpt && <p className="bpost-excerpt">{post.excerpt}</p>}
            <div className="bpost-author">
              <div className="bpost-author-avatar">{post.author.slice(0, 2).toUpperCase()}</div>
              <span className="bpost-author-name">{post.author}</span>
            </div>
          </div>
        </header>

        {/* Body */}
        <article className="bpost-body">
          <div className="bpost-body-inner">
            {blocks.length > 0
              ? renderBlocks(blocks)
              : <p className="bpost-empty">Content coming soon.</p>
            }
          </div>
        </article>

        {/* Footer CTA */}
        <section className="bpost-cta">
          <div className="bpost-cta-inner">
            <div className="bpost-cta-eyebrow">Ready to go global?</div>
            <h2 className="bpost-cta-heading">Translate your first document free.</h2>
            <p className="bpost-cta-sub">Sign up and get 3 credits — no credit card needed. Your first translation takes under 60 seconds.</p>
            <a href="/signup" className="btn-primary">Get started free →</a>
          </div>
        </section>

      </main>
    </>
  );
}

const POST_STYLES = `
/* ── Nav (reuse from blog list) ── */
.blog-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.2rem 2rem;
  background: rgba(250,247,242,0.92);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* ── Layout ── */
.bpost-main { padding-top: 65px; min-height: 100vh; }

/* ── Hero ── */
.bpost-hero {
  background: var(--cream);
  border-bottom: 1px solid var(--border);
  padding: 4.5rem 2rem 3.5rem;
}

.bpost-hero-inner { max-width: 720px; margin: 0 auto; }

.bpost-back {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font-size: 0.82rem; color: var(--ink-light); text-decoration: none;
  margin-bottom: 2rem; transition: color 0.15s;
  font-weight: 400;
}
.bpost-back:hover { color: var(--terracotta); }

.bpost-hero-meta {
  display: flex; align-items: center; gap: 0.5rem;
  flex-wrap: wrap; margin-bottom: 1.25rem;
}

.bpost-meta-dot { color: var(--border); font-size: 0.85rem; }
.bpost-meta-text { font-size: 0.82rem; color: var(--ink-light); }

.bpost-title {
  font-family: var(--font-fraunces), 'Fraunces', serif !important;
  font-size: clamp(2rem, 4.5vw, 3rem) !important;
  font-weight: 400 !important;
  line-height: 1.18 !important;
  color: var(--ink) !important;
  letter-spacing: -0.02em;
  margin-bottom: 1.25rem !important;
}

.bpost-excerpt {
  font-size: 1.1rem; color: var(--ink-light); line-height: 1.7;
  margin-bottom: 2rem; font-weight: 300; max-width: 600px;
}

.bpost-author { display: flex; align-items: center; gap: 0.65rem; }

.bpost-author-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--sage-pale); border: 1.5px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.72rem; font-weight: 600; color: var(--sage);
}

.bpost-author-name { font-size: 0.85rem; font-weight: 500; color: var(--ink); }

/* ── Body ── */
.bpost-body { padding: 4rem 2rem; }

.bpost-body-inner {
  max-width: 680px; margin: 0 auto;
  display: flex; flex-direction: column; gap: 1.5rem;
}

.bpost-h1 {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: 1.65rem; font-weight: 500; line-height: 1.25;
  color: var(--ink); letter-spacing: -0.01em;
  margin-top: 1rem;
}

.bpost-h2 {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: 1.3rem; font-weight: 500; line-height: 1.3;
  color: var(--ink); margin-top: 0.5rem;
}

.bpost-h3 {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: 1.05rem; font-weight: 600; line-height: 1.4;
  color: var(--ink); text-transform: uppercase;
  letter-spacing: 0.04em; font-size: 0.88rem;
}

.bpost-p {
  font-size: 1.05rem; color: var(--ink); line-height: 1.8;
  font-weight: 300;
}

.bpost-list {
  padding-left: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem;
}
.bpost-list--ordered { list-style: decimal; }
.bpost-list:not(.bpost-list--ordered) { list-style: none; padding-left: 0; }
.bpost-list:not(.bpost-list--ordered) .bpost-list-item { display: flex; gap: 0.65rem; }
.bpost-list:not(.bpost-list--ordered) .bpost-list-item::before {
  content: '–'; color: var(--terracotta); font-weight: 600; flex-shrink: 0; margin-top: 2px;
}

.bpost-list-item { font-size: 1.05rem; color: var(--ink); line-height: 1.7; font-weight: 300; }

.bpost-quote {
  border-left: 3px solid var(--terracotta);
  padding: 0.75rem 0 0.75rem 1.5rem;
  margin: 0;
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: 1.15rem; font-weight: 400; font-style: italic;
  color: var(--ink); line-height: 1.6;
}

.bpost-callout {
  background: var(--sage-pale); border: 1px solid #C8DBC8;
  border-radius: 10px; padding: 1rem 1.25rem;
  display: flex; gap: 0.85rem; align-items: flex-start;
}

.bpost-callout-icon { font-size: 1.1rem; flex-shrink: 0; margin-top: 2px; }
.bpost-callout p { font-size: 0.95rem; color: var(--ink); line-height: 1.65; margin: 0; }

.bpost-code-wrap {
  background: var(--ink); border-radius: 10px; overflow: hidden;
}

.bpost-code-lang {
  padding: 0.5rem 1rem; font-size: 0.72rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: rgba(250,247,242,0.4); border-bottom: 1px solid rgba(255,255,255,0.08);
}

.bpost-code { padding: 1.25rem; overflow-x: auto; }
.bpost-code code { font-size: 0.88rem; color: rgba(250,247,242,0.88); line-height: 1.6; }

.bpost-inline-code {
  background: var(--sage-pale); color: var(--sage);
  font-size: 0.88em; padding: 0.1em 0.4em; border-radius: 4px;
  font-family: 'Courier New', monospace;
}

.bpost-link { color: var(--terracotta); text-decoration: underline; text-underline-offset: 3px; }
.bpost-link:hover { text-decoration: none; }

.bpost-figure { margin: 0; }
.bpost-img { width: 100%; border-radius: 10px; border: 1px solid var(--border); }
.bpost-figcaption { font-size: 0.8rem; color: var(--ink-light); margin-top: 0.5rem; text-align: center; }

.bpost-divider { border: none; border-top: 1px solid var(--border); margin: 0.5rem 0; }

.bpost-empty { font-size: 0.95rem; color: var(--ink-light); font-style: italic; }

/* ── CTA block ── */
.bpost-cta {
  background: var(--ink); padding: 5rem 2rem;
}

.bpost-cta-inner {
  max-width: 600px; margin: 0 auto; text-align: center;
}

.bpost-cta-eyebrow {
  font-size: 0.78rem; font-weight: 500; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--terracotta); margin-bottom: 1rem;
}

.bpost-cta-heading {
  font-family: var(--font-fraunces), 'Fraunces', serif;
  font-size: clamp(1.8rem, 3.5vw, 2.5rem); font-weight: 400;
  line-height: 1.2; color: var(--cream); margin-bottom: 1rem;
  letter-spacing: -0.02em;
}

.bpost-cta-sub {
  font-size: 0.95rem; color: rgba(250,247,242,0.6); line-height: 1.7;
  margin-bottom: 2rem; font-weight: 300;
}

@media (max-width: 768px) {
  .bpost-hero { padding: 3.5rem 1.25rem 2.5rem; }
  .bpost-body { padding: 2.5rem 1.25rem; }
  .bpost-title { font-size: 1.8rem !important; }
}
`;
