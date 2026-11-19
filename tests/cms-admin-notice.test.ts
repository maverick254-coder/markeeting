import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { cmsEnabled } from "../src/lib/cms/enabled";
import { middleware } from "../src/middleware";

const values = [undefined, "", "false", "0", "no", "true", "TRUE", "True", "1", "yes", " true"];

test("the /admin switch agrees with what /admin/config.yml serves", async () => {
  const { resolveCmsSettings } = await import("../scripts/render-cms-config.mjs");
  for (const value of values) {
    const environment = { CMS_ENABLED: value };
    let rendererEnabled: boolean;
    try {
      rendererEnabled = resolveCmsSettings(environment).enabled;
    } catch {
      // Enabled without its deployment coordinates: the renderer refuses, which still
      // means it took the value as "enabled".
      rendererEnabled = true;
    }
    assert.equal(cmsEnabled(environment), rendererEnabled, `CMS_ENABLED=${JSON.stringify(value)}`);
  }
});

function withCms<T>(value: string, run: () => T): T {
  const environment = process.env as Record<string, string | undefined>;
  const original = environment.CMS_ENABLED;
  environment.CMS_ENABLED = value;
  try {
    return run();
  } finally {
    if (original === undefined) delete environment.CMS_ENABLED;
    else environment.CMS_ENABLED = original;
  }
}

test("disabled, a request for the Decap shell is answered with the /admin notice", () => {
  const response = withCms("false", () => middleware(new NextRequest("https://redactplus.io/admin/index.html")));
  assert.equal(response.headers.get("location"), null, "a rewrite, never a redirect to an internal address");
  assert.equal(new URL(response.headers.get("x-middleware-rewrite") ?? "").pathname, "/admin");
});

test("enabled, the Decap shell and the rest of the admin tree pass through untouched", () => {
  for (const pathname of ["/admin/index.html", "/admin", "/admin/config.yml"]) {
    const response = withCms("true", () => middleware(new NextRequest(`https://redactplus.io${pathname}`)));
    assert.equal(response.headers.get("location"), null, pathname);
    assert.equal(response.headers.get("content-security-policy"), null, `${pathname} keeps its own policy`);
  }
  // The notice is the page itself, not a redirect, and other admin paths are not redirected.
  for (const pathname of ["/admin", "/admin/config.yml", "/admin/editor-validation.js"]) {
    const response = withCms("false", () => middleware(new NextRequest(`https://redactplus.io${pathname}`)));
    assert.equal(response.headers.get("location"), null, pathname);
  }
});
