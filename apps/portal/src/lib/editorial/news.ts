import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * Portal news, announcements and release posts: Markdown files with YAML front matter in
 * apps/portal/content/news, the same shape the marketing blog uses with Decap CMS. Editors work
 * in Decap's editorial workflow (draft → review → publish, each a branch and pull request);
 * see docs/portal/forum-and-cms-evaluation.md for the collection definition.
 *
 * Only `status: published` entries are ever shown. Drafts never render, in any environment.
 */

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

export const newsFrontMatterSchema = z.object({
  title: z.string().min(5).max(160),
  date: dateString,
  type: z.enum(["news", "announcement", "release"]),
  category: z.string().min(2).max(60),
  tags: z.array(z.string().regex(/^[a-z0-9-]{1,30}$/)).max(8).default([]),
  excerpt: z.string().min(10).max(300),
  status: z.enum(["draft", "published"]),
  featured: z.boolean().default(false),
  author: z.string().min(2).max(80),
  image: z
    .object({
      src: z.string().regex(/^\/[A-Za-z0-9/_.-]+$/, "a local path such as /images/news/file.png"),
      alt: z.string().min(3).max(200),
    })
    .optional(),
});

export type NewsFrontMatter = z.infer<typeof newsFrontMatterSchema>;
export interface NewsArticle extends NewsFrontMatter {
  slug: string;
  body: string;
}

export const NEWS_TYPE_LABELS: Record<NewsFrontMatter["type"], string> = {
  news: "News",
  announcement: "Announcement",
  release: "Release",
};

export function defaultNewsDir() {
  return path.join(process.cwd(), "content", "news");
}

export function parseNewsFile(fileName: string, raw: string): { ok: true; article: NewsArticle } | { ok: false; error: string } {
  const slug = fileName.replace(/\.md$/, "");
  if (!/^[a-z0-9-]{3,100}$/.test(slug)) return { ok: false, error: `${fileName}: file name must be a lower-case slug` };
  const match = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { ok: false, error: `${fileName}: missing front matter` };
  let data: unknown;
  try {
    data = parseYaml(match[1]);
  } catch {
    return { ok: false, error: `${fileName}: front matter is not valid YAML` };
  }
  const parsed = newsFrontMatterSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${fileName}: ${issue.path.join(".")} ${issue.message}` };
  }
  return { ok: true, article: { ...parsed.data, slug, body: match[2].trim() } };
}

/** Published articles, newest first. Invalid files are skipped and logged by name only. */
export async function loadPublishedNews(dir: string = defaultNewsDir()): Promise<NewsArticle[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((file) => file.endsWith(".md"));
  } catch {
    return [];
  }
  const articles: NewsArticle[] = [];
  for (const file of files) {
    const result = parseNewsFile(file, await readFile(path.join(dir, file), "utf8"));
    if (!result.ok) {
      console.error(`[portal] news entry skipped: ${result.error}`);
      continue;
    }
    if (result.article.status === "published") articles.push(result.article);
  }
  return articles.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}
