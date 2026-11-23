// The blog posts the route tests expect, read from content/blog the way the site reads
// them. Editors publish and delete posts through the Content Studio, so route tests
// derive their expectations from the content instead of naming particular posts: a CMS
// publish or delete must never turn CI red on its own.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const blogDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "content", "blog");

// Mirrors slugifyCategory in src/lib/blog/content.ts.
export function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Mirrors headingSlug in src/lib/blog/headings.ts (first occurrence only).
export function headingId(text) {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

// React's HTML escaping, enough to find a title or alt text in rendered markup.
export function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readArticles() {
  return readdirSync(blogDirectory)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const source = readFileSync(path.join(blogDirectory, file), "utf8");
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
      if (!match) throw new Error(`content/blog/${file} has no frontmatter.`);
      const data = YAML.parse(match[1]);
      return { ...data, tags: data.tags ?? [], body: source.slice(match[0].length) };
    });
}

function isPublished(article, now) {
  if (article.publication === "archived") return false;
  if (article.publication === "immediate") return true;
  return new Date(article.date).getTime() <= now.getTime();
}

export function publishedArticles(now = new Date()) {
  return readArticles()
    .filter((article) => isPublished(article, now))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

export function unpublishedArticles(now = new Date()) {
  return readArticles().filter((article) => !isPublished(article, now));
}

// Mirrors the featured slot in src/app/blog/page.tsx.
export function featuredArticle(articles) {
  return articles.find((article) => article.featured) ?? articles[0];
}

// Level-2 and level-3 Markdown headings, which the table of contents lists.
export function articleHeadings(article) {
  return [...article.body.matchAll(/^#{2,3}\s+(.+?)\s*#*\s*$/gm)].map((match) => match[1]);
}

export const archiveMonth = (date) =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(date));
