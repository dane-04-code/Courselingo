import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DATABASE_ID = process.env.NOTION_BLOG_DATABASE_ID!;

export interface Post {
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  author: string;
  date: string;
  readTime: string;
  featured: boolean;
  tag: string;
  pageId?: string;
}

export interface Block {
  type: string;
  // paragraph, heading_1/2/3, bulleted_list_item, numbered_list_item, code, quote, callout, image, divider
  text?: string;        // plain text for most blocks
  richText?: Array<{ plain_text: string; href?: string | null; annotations: { bold: boolean; italic: boolean; code: boolean } }>;
  language?: string;    // for code blocks
  url?: string;         // for image blocks
  caption?: string;     // for image/callout blocks
  icon?: string;        // for callout blocks
}

export async function getBlogPost(slug: string): Promise<Post | null> {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_BLOG_DATABASE_ID) return null;
  try {
    const response = await notion.databases.query({
      database_id: process.env.NOTION_BLOG_DATABASE_ID,
      filter: {
        and: [
          { property: "Slug", rich_text: { equals: slug } },
          { property: "Published", checkbox: { equals: true } },
        ],
      },
    });
    if (!response.results.length) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = response.results[0] as any;
    const props = page.properties;
    const rawDate: string | undefined = props["Publish Date"]?.date?.start;
    return {
      slug:     props.Slug?.rich_text?.[0]?.plain_text ?? "",
      category: props.Category?.select?.name ?? "Uncategorised",
      title:    props.Title?.title?.[0]?.plain_text ?? "Untitled",
      excerpt:  props.Excerpt?.rich_text?.[0]?.plain_text ?? "",
      author:   props.Author?.rich_text?.[0]?.plain_text ?? "CourseLingo Team",
      date:     rawDate ? new Date(rawDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
      readTime: props["Read Time"]?.rich_text?.[0]?.plain_text ?? "",
      featured: props.Featured?.checkbox ?? false,
      tag:      props.Tag?.rich_text?.[0]?.plain_text ?? "",
      pageId:   page.id,
    };
  } catch (err) {
    console.error("[notion] getBlogPost failed:", err);
    return null;
  }
}

export async function getPageBlocks(pageId: string): Promise<Block[]> {
  if (!process.env.NOTION_TOKEN) return [];
  try {
    const response = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (response.results as any[]).map((block): Block => {
      const richText = block[block.type]?.rich_text ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plainText = richText.map((t: any) => t.plain_text).join("");
      switch (block.type) {
        case "image":
          return { type: "image", url: block.image?.file?.url ?? block.image?.external?.url ?? "", caption: block.image?.caption?.[0]?.plain_text ?? "" };
        case "code":
          return { type: "code", text: plainText, language: block.code?.language ?? "text" };
        case "callout":
          return { type: "callout", text: plainText, icon: block.callout?.icon?.emoji ?? "💡" };
        default:
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return { type: block.type, text: plainText, richText: richText.map((t: any) => ({ plain_text: t.plain_text, href: t.href, annotations: t.annotations })) };
      }
    });
  } catch (err) {
    console.error("[notion] getPageBlocks failed:", err);
    return [];
  }
}

export async function getBlogPosts(): Promise<Post[]> {
  if (!process.env.NOTION_TOKEN || !DATABASE_ID) {
    console.warn("[notion] NOTION_TOKEN or NOTION_BLOG_DATABASE_ID not set — returning empty posts");
    return [];
  }

  try {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: "Published",
        checkbox: { equals: true },
      },
      sorts: [{ property: "Publish Date", direction: "descending" }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return response.results.map((page: any) => {
      const props = page.properties;
      const rawDate: string | undefined = props["Publish Date"]?.date?.start;
      return {
        slug:     props.Slug?.rich_text?.[0]?.plain_text ?? "",
        category: props.Category?.select?.name ?? "Uncategorised",
        title:    props.Title?.title?.[0]?.plain_text ?? "Untitled",
        excerpt:  props.Excerpt?.rich_text?.[0]?.plain_text ?? "",
        author:   props.Author?.rich_text?.[0]?.plain_text ?? "CourseLingo Team",
        date:     rawDate
          ? new Date(rawDate).toLocaleDateString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
            })
          : "",
        readTime: props["Read Time"]?.rich_text?.[0]?.plain_text ?? "",
        featured: props.Featured?.checkbox ?? false,
        tag:      props.Tag?.rich_text?.[0]?.plain_text ?? "",
      };
    });
  } catch (err) {
    console.error("[notion] Failed to fetch blog posts:", err);
    return [];
  }
}
