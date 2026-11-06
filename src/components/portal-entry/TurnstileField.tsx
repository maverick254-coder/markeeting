"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Cloudflare Turnstile, the registration security check the Control Center requires
 * (TrialApi.cs verifies the token with its secret). Explicit rendering, so the widget appears
 * only inside the open registration form, and the token lives in React state only: it is never
 * stored, logged or put in a URL. Tokens are single use, so the form resets the widget after
 * every submission.
 */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export interface TurnstileHandle {
  /** Clears the token and asks for a new one (after any submission). */
  reset(): void;
}

export const TurnstileField = forwardRef<TurnstileHandle, {
  siteKey: string;
  onToken: (token: string | null) => void;
  onUnavailable: () => void;
  describedBy?: string;
}>(function TurnstileField({ siteKey, onToken, onUnavailable, describedBy }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  // The latest callbacks, so the widget is rendered once and never re-rendered by a prop change.
  const callbacks = useRef({ onToken, onUnavailable });
  callbacks.current = { onToken, onUnavailable };

  useImperativeHandle(ref, () => ({
    reset() {
      callbacks.current.onToken(null);
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current || widget.current) return;
        widget.current = turnstile.render(container.current, {
          sitekey: siteKey,
          action: "trial-registration",
          theme: "light",
          size: "flexible",
          callback: (token: string) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(null),
          "timeout-callback": () => callbacks.current.onToken(null),
          "error-callback": () => {
            callbacks.current.onToken(null);
            return false;
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        callbacks.current.onUnavailable();
      });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  return <div ref={container} data-turnstile aria-describedby={describedBy} className={failed ? "hidden" : "min-h-[65px]"} />;
});
