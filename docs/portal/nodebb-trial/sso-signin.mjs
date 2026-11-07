// Local trial only: one full browserless sign-in NodeBB -> mock OpenID provider -> NodeBB.
// Usage: node sso-signin.mjs <email> [verified=true]. Prints the uid NodeBB signed in (no secrets).
const [email, verified = "true"] = process.argv.slice(2);
const jar = new Map();
const keep = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const go = async (url, init = {}) => { const res = await fetch(url, { ...init, redirect: "manual", headers: { ...(init.headers || {}), cookie: cookie() } }); keep(res); return res; };
let res = await go("http://localhost:4567/auth/redactplus");
const authorize = new URL(res.headers.get("location"));
const form = new URLSearchParams(authorize.searchParams);
form.set("email", email); form.set("name", email.split("@")[0]); form.set("decision", "approve");
if (verified === "true") form.set("email_verified", "true");
res = await fetch("http://127.0.0.1:3202/authorize", { method: "POST", body: form, redirect: "manual" });
res = await go(res.headers.get("location"));
const where = res.headers.get("location");
const config = await (await go("http://localhost:4567/api/config")).json();
console.log(JSON.stringify({ email, callbackStatus: res.status, redirectedTo: where, uid: config.uid, loggedIn: config.loggedIn }));
