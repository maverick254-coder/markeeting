import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders forum and editorial Markdown safely: raw HTML is never rendered (react-markdown's
 * default), URLs pass through its safe-protocol filter, and external links open with
 * rel="noopener noreferrer nofollow ugc". Code keeps its whitespace and scrolls inside its box.
 */
const components: Components = {
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
  a: ({ href, children }) => {
    const external = Boolean(href && /^https?:\/\//.test(href));
    return (
      <a
        href={href}
        className="font-medium text-accent-ink underline decoration-accent-ink/30 underline-offset-4 hover:decoration-accent-ink"
        {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" } : {})}
      >
        {children}
      </a>
    );
  },
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-accent-warm/50 pl-4 text-ink-muted">{children}</blockquote>,
  h1: ({ children }) => <h3 className="type-h3 mb-2 mt-5">{children}</h3>,
  h2: ({ children }) => <h3 className="type-h3 mb-2 mt-5">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-2 mt-4 font-semibold text-ink">{children}</h4>,
  pre: ({ children }) => (
    // Fenced code without a language reaches `code` with no class, like inline code, so the
    // inline styling is reset here for anything inside a block.
    <pre className="my-4 overflow-x-auto rounded-xl border border-border-subtle bg-[#1c1917] p-4 font-mono text-[0.8125rem] leading-6 text-[#f5f5f4] [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[length:inherit] [&_code]:text-inherit">
      {children}
    </pre>
  ),
  code: ({ className, children }) =>
    className?.startsWith("language-") ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded-md bg-surface-active px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>
    ),
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt ?? ""} loading="lazy" className="my-4 h-auto max-w-full rounded-xl border border-border-subtle" />
    ) : null,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-border-subtle">
      <table className="w-full border-collapse text-left text-body-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border-subtle bg-surface-raised px-3 py-2 font-semibold text-ink">{children}</th>,
  td: ({ children }) => <td className="border-b border-border-subtle px-3 py-2 align-top">{children}</td>,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("break-words text-[0.9375rem] leading-7 text-ink", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
