import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => (error || !port ? reject(error ?? new Error("No test port")) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl, processHandle) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Production server exited before readiness with code ${processHandle.exitCode}.`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Server is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for the production server.");
}

function runTests(baseUrl, cmsEnabledBaseUrl) {
  const testFiles = [
    "tests/marketing-only.test.mjs",
    "tests/features-routes.test.mjs",
    "tests/site-routes.test.mjs",
    "tests/redactplus-routes.test.mjs",
    "tests/phase1-homepage.test.mjs",
    "tests/phase4a-routes.test.mjs",
    "tests/pricing-product-scope.test.mjs",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", ...testFiles], {
      cwd: repositoryRoot,
      env: { ...process.env, TEST_BASE_URL: baseUrl, TEST_CMS_ENABLED_BASE_URL: cmsEnabledBaseUrl },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Route tests failed (${signal ?? `exit ${code}`}).`));
    });
  });
}

const nextBin = path.join(repositoryRoot, "node_modules", "next", "dist", "bin", "next");

async function startServer(cmsEnabled, avoidPort) {
  let port = await availablePort();
  // Both ports are probed before either server binds, so never take the first one twice.
  while (port === avoidPort) port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: repositoryRoot,
    // Route acceptance must exercise the deterministic fail-closed CMS profile,
    // never a developer's ignored .env.local deployment coordinates. A second server
    // switches only CMS_ENABLED on, so /admin is checked in both states.
    env: { ...process.env, PORT: String(port), CMS_ENABLED: cmsEnabled ? "true" : "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return { baseUrl, port, server };
}

const disabled = await startServer(false);
const enabled = await startServer(true, disabled.port);

try {
  await Promise.all([waitForServer(disabled.baseUrl, disabled.server), waitForServer(enabled.baseUrl, enabled.server)]);
  await runTests(disabled.baseUrl, enabled.baseUrl);
} finally {
  disabled.server.kill("SIGTERM");
  enabled.server.kill("SIGTERM");
}
