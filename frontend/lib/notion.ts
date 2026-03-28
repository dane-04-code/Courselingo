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
}

export async function getBlogPosts(): Promise<Post[]> {
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
}
