import type { Config } from "tailwindcss";

/**
 * The marketing site's semantic palette and type scale (tailwind.config.ts at the repository
 * root), with the same class names so components read the same in both applications, on the
 * marketing site's default light palette (globals.css).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--or-midnight) / <alpha-value>)",
        "surface-raised": "rgb(var(--or-graphite) / <alpha-value>)",
        "surface-active": "rgb(var(--or-elevated) / <alpha-value>)",
        elevated: "rgb(var(--or-elevated) / <alpha-value>)",
        "border-subtle": "rgb(var(--or-line) / <alpha-value>)",
        ink: "rgb(var(--or-fg) / <alpha-value>)",
        "ink-muted": "rgb(var(--or-fg-muted) / <alpha-value>)",
        "accent-warm": "rgb(var(--or-coral) / <alpha-value>)",
        "accent-warm-hover": "rgb(var(--or-coral-soft) / <alpha-value>)",
        "on-accent": "#1C1917",
        "accent-ink": "rgb(var(--or-coral-ink) / <alpha-value>)",
        "accent-ink-hover": "rgb(var(--or-coral-ink-hover) / <alpha-value>)",
        "accent-cool": "rgb(var(--or-signal) / <alpha-value>)",
        danger: "rgb(var(--or-danger) / <alpha-value>)",
        positive: "rgb(var(--or-positive) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["var(--font-geist)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "display-sm": ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "700" }],
        "heading-xl": ["1.5rem", { lineHeight: "1.3", fontWeight: "600" }],
        "heading-lg": ["1.25rem", { lineHeight: "1.35", fontWeight: "600" }],
        heading: ["1.125rem", { lineHeight: "1.4", fontWeight: "600" }],
        "heading-sm": ["1rem", { lineHeight: "1.45", fontWeight: "600" }],
        "body-lg": ["1rem", { lineHeight: "1.7", fontWeight: "400" }],
        body: ["0.9375rem", { lineHeight: "1.7", fontWeight: "400" }],
        "body-sm": ["0.875rem", { lineHeight: "1.6", fontWeight: "400" }],
        caption: ["0.75rem", { lineHeight: "1.5", fontWeight: "500" }],
      },
      transitionTimingFunction: {
        standard: "var(--or-ease-standard)",
      },
      maxWidth: {
        content: "72.5rem",
        prose: "65ch",
      },
      boxShadow: {
        action: "inset 0 1px 0 rgb(255 255 255 / 0.28), 0 6px 18px -6px rgb(var(--or-coral) / 0.55)",
        "action-hover": "inset 0 1px 0 rgb(255 255 255 / 0.32), 0 10px 26px -8px rgb(var(--or-coral) / 0.65)",
        panel: "0 1px 2px rgb(var(--or-shadow) / 0.04), 0 18px 48px -12px rgb(var(--or-shadow) / 0.16)",
        card: "0 1px 2px rgb(var(--or-shadow) / 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
