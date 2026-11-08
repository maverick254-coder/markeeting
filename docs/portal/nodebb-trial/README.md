# NodeBB trial scripts (local development only)

> Superseded: the production bridge is `services/forum-bridge/` (no master token; the portal
> sends a verified identity). These are the feasibility trial's scripts, kept as the record.

These are the scripts and the bridge plugin behind [../forum-nodebb-trial.md](../forum-nodebb-trial.md).
They expect a NodeBB install in a folder outside this repository, laid out like this:
`nodebb/` (NodeBB v4.16.7), `node22/` (Node ≥ 22.19) and `plugins/`, with this folder's files beside them.
None of this runs on a server.

| File | What it does |
|---|---|
| `make-token.js` | Creates a master API token with NodeBB's own module and writes it to `master-token.txt` (mode 600). Prints only the token's length |
| `set-sso-roles.js` | Saves the SSO plugin's role table: `forum-moderator` → Global Moderators |
| `flows.mjs` | Runs the 27 forum, moderation and isolation checks through the Read and Write APIs, acting as each user with `_uid` |
| `sso-signin.mjs` | Runs one sign-in without a browser: NodeBB → the mock OpenID provider (port 3202) → NodeBB. Prints the uid |
| `nodebb-plugin-redactplus-bridge/` | REST routes the portal needs and NodeBB lacks: accept or unaccept an answer, and upload with a token |

Never commit `master-token.txt`, the SSO client secret, the admin credentials or the NodeBB `config.json`.
