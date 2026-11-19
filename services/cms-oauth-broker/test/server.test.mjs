import assert from "node:assert/strict";
import test from "node:test";

import { loadServerConfig } from "../src/server.mjs";

test("server requires explicit TLS material and bounded network settings", () => {
  assert.throws(() => loadServerConfig({}), /OAUTH_TLS_CERT_PATH/);
  assert.throws(
    () => loadServerConfig({ OAUTH_TLS_CERT_PATH: "cert.pem", OAUTH_TLS_KEY_PATH: "key.pem", OAUTH_PORT: "0" }),
    /OAUTH_PORT/
  );
  assert.throws(
    () => loadServerConfig({ OAUTH_TLS_CERT_PATH: "cert.pem", OAUTH_TLS_KEY_PATH: "key.pem", OAUTH_BIND_HOST: "https://example.com" }),
    /OAUTH_BIND_HOST/
  );

  assert.deepEqual(loadServerConfig({
    OAUTH_TLS_CERT_PATH: "cert.pem",
    OAUTH_TLS_KEY_PATH: "key.pem",
    OAUTH_PORT: "8443",
    OAUTH_BIND_HOST: "127.0.0.1",
  }), {
    certificatePath: "cert.pem",
    privateKeyPath: "key.pem",
    port: 8443,
    host: "127.0.0.1",
  });
});

test("behind a TLS-terminating proxy the broker needs no TLS files and refuses stray ones", () => {
  assert.deepEqual(loadServerConfig({ OAUTH_TLS_TERMINATION: "proxy", OAUTH_PORT: "8787", OAUTH_BIND_HOST: "0.0.0.0" }), {
    termination: "proxy",
    port: 8787,
    host: "0.0.0.0",
  });
  assert.throws(
    () => loadServerConfig({ OAUTH_TLS_TERMINATION: "proxy", OAUTH_TLS_KEY_PATH: "key.pem" }),
    /not used when the proxy terminates TLS/
  );
  assert.throws(() => loadServerConfig({ OAUTH_TLS_TERMINATION: "none" }), /broker or proxy/);
  // The default is unchanged: the broker serves HTTPS and needs both files.
  assert.throws(() => loadServerConfig({ OAUTH_TLS_TERMINATION: "broker" }), /OAUTH_TLS_CERT_PATH/);
});

test("in proxy mode the broker answers over plain HTTP and still builds URLs from the public HTTPS origin", async () => {
  const { createHttpsBrokerServer } = await import("../src/server.mjs");
  let seen;
  const { server } = createHttpsBrokerServer({
    environment: { OAUTH_TLS_TERMINATION: "proxy", OAUTH_PUBLIC_ORIGIN: "https://cms-auth.example" },
    handler: async (request) => {
      seen = request.url;
      return new Response("ok", { status: 200 });
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health?x=1`);
    assert.equal(response.status, 200);
    assert.equal(seen, "https://cms-auth.example/health?x=1");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
