// Local SMTP capture server for testing enquiry email without sending any.
//
//   node scripts/leads/smtp-capture.mjs [--port 2465] [--out .smtp-capture]
//
// It listens on 127.0.0.1 only, speaks implicit TLS (like SpaceMail on port 465) with a
// throwaway self-signed certificate for "localhost", accepts the AUTH it is given and
// writes each message to <out>/<n>.eml. Nothing is relayed: it has no outbound code.
//
// The certificate is generated with openssl into <out>/tls/. Start the site with
//   NODE_EXTRA_CA_CERTS=<out>/tls/cert.pem
// so it trusts this certificate the normal way. Certificate verification is never
// switched off. See docs/operations/enquiry-email.md for the full procedure.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import tls from "node:tls";

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const port = Number(argument("--port", "2465"));
const out = path.resolve(argument("--out", ".smtp-capture"));
const tlsDir = path.join(out, "tls");
mkdirSync(tlsDir, { recursive: true });

const keyPath = path.join(tlsDir, "key.pem");
const certPath = path.join(tlsDir, "cert.pem");
if (!existsSync(certPath)) {
  // A minimal config of its own, so a missing or unrelated system OPENSSL_CONF cannot break it.
  const configPath = path.join(tlsDir, "openssl.cnf");
  writeFileSync(configPath, "[req]\ndistinguished_name = dn\n[dn]\n");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
    "-keyout", keyPath, "-out", certPath,
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost",
  ], { stdio: "ignore", env: { ...process.env, OPENSSL_CONF: configPath } });
}

let count = readdirSync(out).filter((name) => name.endsWith(".eml")).length;

const server = tls.createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  (socket) => {
    let buffer = "";
    let inData = false;
    let data = [];
    let envelope = { from: "", to: [], user: "" };
    let pendingLogin = null;
    const reply = (line) => socket.write(`${line}\r\n`);
    reply("220 localhost ESMTP capture (nothing is relayed)");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            count += 1;
            const file = path.join(out, `${String(count).padStart(3, "0")}.eml`);
            writeFileSync(file, data.join("\r\n"));
            // Only the envelope is printed: never the AUTH secret or message content.
            console.log(`captured ${path.basename(file)} from=${envelope.from} to=${envelope.to.join(",")} auth=${envelope.user || "(none)"}`);
            data = [];
            reply("250 2.0.0 queued as capture-" + count);
          } else {
            data.push(line.startsWith("..") ? line.slice(1) : line);
          }
          continue;
        }
        if (pendingLogin === "user") {
          envelope.user = Buffer.from(line, "base64").toString("utf8");
          pendingLogin = "pass";
          reply("334 UGFzc3dvcmQ6");
          continue;
        }
        if (pendingLogin === "pass") {
          pendingLogin = null;
          reply("235 2.7.0 Authentication successful");
          continue;
        }
        const [verb, ...rest] = line.split(" ");
        const command = verb.toUpperCase();
        if (command === "EHLO" || command === "HELO") {
          socket.write("250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n");
        } else if (command === "AUTH" && rest[0]?.toUpperCase() === "PLAIN") {
          const decoded = Buffer.from(rest[1] ?? "", "base64").toString("utf8").split("\u0000");
          envelope.user = decoded[1] ?? "";
          reply("235 2.7.0 Authentication successful");
        } else if (command === "AUTH" && rest[0]?.toUpperCase() === "LOGIN") {
          pendingLogin = "user";
          reply("334 VXNlcm5hbWU6");
        } else if (command === "MAIL") {
          envelope = { from: line.match(/<([^>]*)>/)?.[1] ?? "", to: [], user: envelope.user };
          reply("250 2.1.0 OK");
        } else if (command === "RCPT") {
          envelope.to.push(line.match(/<([^>]*)>/)?.[1] ?? "");
          reply("250 2.1.5 OK");
        } else if (command === "DATA") {
          inData = true;
          reply("354 End data with <CR><LF>.<CR><LF>");
        } else if (command === "RSET") {
          envelope = { from: "", to: [], user: envelope.user };
          reply("250 2.0.0 OK");
        } else if (command === "NOOP") {
          reply("250 2.0.0 OK");
        } else if (command === "QUIT") {
          reply("221 2.0.0 Bye");
          socket.end();
        } else {
          reply("502 5.5.2 Command not implemented");
        }
      }
    });
    socket.on("error", () => undefined);
  }
);

server.listen(port, "127.0.0.1", () => {
  console.log(`SMTP capture on 127.0.0.1:${port} (implicit TLS). Messages: ${out}`);
  console.log(`Trust its certificate with NODE_EXTRA_CA_CERTS=${certPath}`);
});
