// Local NodeBB trial: drives the RedactPlus forum flows through NodeBB's Read and Write APIs the way a
// server-side portal adapter would (master token, acting as each user with _uid). Prints a PASS/FAIL table.
import { readFileSync, writeFileSync } from "node:fs";

const base = "http://localhost:4567";
const token = readFileSync(new URL("./master-token.txt", import.meta.url), "utf8").trim();
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 140) });

async function call(method, path, uid, body) {
  const url = new URL(base + path);
  const init = { method, headers: { authorization: `Bearer ${token}` } };
  if (method === "GET") url.searchParams.set("_uid", String(uid));
  else { init.headers["content-type"] = "application/json"; init.body = JSON.stringify({ ...(body || {}), _uid: uid }); }
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}
const resp = (r) => (r.json && (r.json.response ?? r.json)) || {};

for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/api/config")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 2000)); }

const ADMIN = 1;
const stamp = Date.now().toString(36);

// ---- categories (the portal's planned sections) ----
const planned = [
  ["announcements", "Announcements"], ["getting-started", "Getting started"], ["documents", "Document redaction"],
  ["audio-video", "Audio and video"], ["exporting", "Exporting and checking output"], ["ideas", "Ideas and feedback"],
];
const cids = {};
for (const [slug, name] of planned) {
  const r = await call("POST", "/api/v3/categories", ADMIN, { name, description: `${slug} (trial)` });
  cids[slug] = resp(r).cid;
}
check("Create the six portal categories (admin)", Object.values(cids).every(Boolean), JSON.stringify(cids));

// ---- users ----
const mk = async (username) => resp(await call("POST", "/api/v3/users", ADMIN, { username: `${username}-${stamp}`, email: `${username}-${stamp}@forum.test` })).uid;
const alice = await mk("alice"), bob = await mk("bob"), mod = await mk("mod");
check("Create customers and a staff user (admin)", alice && bob && mod, `alice=${alice} bob=${bob} mod=${mod}`);
const modJoin = await call("PUT", `/api/v3/groups/global-moderators/membership/${mod}`, ADMIN);
check("Make the staff user a global moderator (from a group, as SSO role mapping would)", modJoin.status === 200, modJoin.status);

// ---- question, answers, comments ----
const q = await call("POST", "/api/v3/topics", alice, {
  cid: cids.exporting, title: "Exported PDF still shows text under redaction boxes", isQuestion: 1,
  content: "After exporting, **selecting text** under a box still copies it. Which setting burns redactions in?",
  tags: ["pdf", "export"],
});
const tid = resp(q).tid, mainPid = resp(q).mainPid;
check("Customer asks a question with Markdown and tags", q.status === 200 && tid, `tid=${tid} status=${q.status}`);
const qa0 = resp(await call("GET", `/api/v3/plugins/qna/${tid}`, alice));
check("Q&A plugin marks it as an unsolved question", String(qa0.isQuestion) === "1" && String(qa0.isSolved) === "0", JSON.stringify(qa0));

const a1 = resp(await call("POST", `/api/v3/topics/${tid}`, bob, { content: "Turn on **Flatten output** in Export settings; it rasterises redacted pages." }));
const a2 = resp(await call("POST", `/api/v3/topics/${tid}`, mod, { content: "Staff answer: use Export, then *Check output* to verify nothing is selectable." }));
check("Two answers (customer and staff)", a1.pid && a2.pid, `a1=${a1.pid} a2=${a2.pid}`);
const c1 = resp(await call("POST", `/api/v3/topics/${tid}`, alice, { content: "Does flatten keep the file searchable?", toPid: a1.pid }));
const c2 = resp(await call("POST", `/api/v3/topics/${tid}`, bob, { content: "Only the unredacted text, via OCR.", toPid: c1.pid }));
check("Nested comments (reply to an answer, reply to that reply)", c1.pid && c2.pid && String(c1.toPid) === String(a1.pid), `c1=${c1.pid}->${c1.toPid} c2=${c2.pid}->${c2.toPid}`);

// ---- votes ----
const v1 = await call("PUT", `/api/v3/posts/${a1.pid}/vote`, alice, { delta: 1 });
const v2 = await call("PUT", `/api/v3/posts/${mainPid}/vote`, bob, { delta: 1 });
const v3 = await call("PUT", `/api/v3/posts/${a2.pid}/vote`, bob, { delta: -1 });
const vSelf = await call("PUT", `/api/v3/posts/${a1.pid}/vote`, bob, { delta: 1 });
check("Up and down votes on questions and answers", v1.status === 200 && v2.status === 200 && v3.status === 200, `${v1.status}/${v2.status}/${v3.status}`);
check("Voting on your own post is refused", vSelf.status !== 200, `${vSelf.status} ${resp(vSelf).message || vSelf.json?.status?.message || ""}`);

// ---- accepted answer ----
const accStranger = await call("PUT", `/api/v3/plugins/redactplus/topics/${tid}/accepted`, bob, { pid: a1.pid });
check("A non-author cannot accept an answer", accStranger.status === 403, `${accStranger.status} ${accStranger.json?.status?.message || ""}`);
const other = resp(await call("POST", "/api/v3/topics", bob, { cid: cids.documents, title: `Unrelated question ${stamp}`, content: "Body text for the unrelated question.", isQuestion: 1 }));
const accWrong = await call("PUT", `/api/v3/plugins/redactplus/topics/${tid}/accepted`, alice, { pid: other.mainPid });
check("A post from another question cannot be accepted", accWrong.status === 400, `${accWrong.status} ${accWrong.json?.status?.message || ""}`);
const acc = await call("PUT", `/api/v3/plugins/redactplus/topics/${tid}/accepted`, alice, { pid: a1.pid });
const qa1 = resp(await call("GET", `/api/v3/plugins/qna/${tid}`, alice));
check("The question's author accepts an answer", acc.status === 200 && String(qa1.isSolved) === "1", `${acc.status} ${JSON.stringify(qa1)}`);

// ---- read back as the portal would ----
const topic = resp(await call("GET", `/api/topic/${tid}`, bob));
check("Read the thread: posts, votes, tags, views, solved post", Array.isArray(topic.posts) && topic.posts.length >= 4,
  `posts=${topic.posts?.length} votes(main)=${topic.posts?.[0]?.votes} tags=${(topic.tags || []).map((t) => t.value).join(",")} views=${topic.viewcount} solvedPid=${topic.solvedPid} isSolved=${topic.isSolved}`);
const solvedOk = String(topic.solvedPid) === String(a1.pid);
check("The accepted answer is identifiable (solvedPid)", solvedOk, `solvedPid=${topic.solvedPid} expected ${a1.pid}`);

// ---- tags, search, unsolved list ----
const tags = resp(await call("GET", "/api/tags", bob));
check("Popular tags", (tags.tags || []).some((t) => t.value === "export"), (tags.tags || []).slice(0, 5).map((t) => `${t.value}:${t.score}`).join(" "));
const search = resp(await call("GET", "/api/search?term=flatten&in=titlesposts", bob));
check("Full-text search finds the answer", (search.posts || []).length > 0, `matches=${(search.posts || []).length}`);
const unsolved = await call("GET", "/api/unsolved", bob);
check("Answered/unanswered lists (Q&A plugin)", unsolved.status === 200, `GET /api/unsolved -> ${unsolved.status}`);

// ---- notifications ----
await new Promise((r) => setTimeout(r, 5000)); // NodeBB delivers notifications in batches
const notes = resp(await call("GET", "/api/notifications", alice));
check("Notifications for the asker (answers, votes)", (notes.notifications || []).length > 0,
  `count=${(notes.notifications || []).length} types=${[...new Set((notes.notifications || []).map((n) => n.type))].join(",")}`);

// ---- moderation ----
const flag = await call("POST", "/api/v3/flags", bob, { type: "post", id: c1.pid, reason: "Trial report: off-topic" });
check("A customer reports a post", flag.status === 200, flag.status);
const queueMod = await call("GET", "/api/flags", mod);
const queueCustomer = await call("GET", "/api/flags", bob);
check("Moderators see the report queue", queueMod.status === 200 && (resp(queueMod).flags || []).length > 0, `mod -> ${queueMod.status}, ${(resp(queueMod).flags || []).length} flag(s)`);
check("Customers cannot see the report queue", queueCustomer.status !== 200 || !(resp(queueCustomer).flags || []).length, `customer -> ${queueCustomer.status}`);

// ---- isolation ----
const admPage = await call("GET", "/api/admin/manage/users", bob);
check("Customer cannot open admin pages", admPage.status === 401 || admPage.status === 403, admPage.status);
const admTok = await call("POST", "/api/v3/admin/tokens", bob, { uid: bob });
check("Customer cannot create API tokens", admTok.status === 401 || admTok.status === 403, `${admTok.status} ${admTok.json?.status?.message || ""}`);
const editOther = await call("PUT", `/api/v3/posts/${mainPid}`, bob, { content: "hijacked" });
check("Customer cannot edit someone else's question", editOther.status === 403, `${editOther.status} ${editOther.json?.status?.message || ""}`);
const delOther = await call("DELETE", `/api/v3/posts/${a2.pid}/state`, bob);
check("Customer cannot delete someone else's answer", delOther.status === 403, `${delOther.status} ${delOther.json?.status?.message || ""}`);
const promote = await call("PUT", `/api/v3/groups/administrators/membership/${bob}`, bob);
check("Customer cannot make themselves an administrator", promote.status === 401 || promote.status === 403 || promote.status === 400, `${promote.status} ${promote.json?.status?.message || ""}`);
const modDelete = await call("DELETE", `/api/v3/posts/${c2.pid}/state`, mod);
check("A moderator can remove a post", modDelete.status === 200, modDelete.status);

writeFileSync(new URL("./flows-result.json", import.meta.url), JSON.stringify({ tid, results }, null, 2));
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}  ${r.detail}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed; question tid ${tid}`);
