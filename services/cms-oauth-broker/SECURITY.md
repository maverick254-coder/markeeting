# Security boundary

The broker is a confidential OAuth client. Its client secret, state-signing key, authorization codes, PKCE verifiers, cookies, access tokens, and refresh tokens must never enter source control, public CMS configuration, URLs after callback handling, analytics, or logs.

The service emits only an event name, outcome, and random correlation identifier. Platform access logs must be configured to redact query strings and cookies because the callback request necessarily carries a short-lived authorization code and state in its query.

Current deployment constraints:

- HTTPS is mandatory for the broker and every allowed CMS origin.
- GitHub callback wildcard matching must be disabled.
- GitHub OAuth expiring access tokens must be enabled; non-expiring token responses are rejected.
- The current transaction store is in-memory, single-process, expiry-pruned, and capacity-bounded. Do not use multiple replicas or an ephemeral serverless runtime until a shared atomic consume-once TTL adapter is implemented and tested.
- Rate limiting and request-volume controls remain deployment-edge responsibilities and are required before internet exposure.
- The OAuth scope is exactly `public_repo` (public repositories) or `repo` (needed for a private repository; it reaches every repository the editor can access, private ones included). The broker checks the configured repository and staff identity, but GitHub OAuth scopes are not repository-specific, so keep the staff allowlist short.
- With `OAUTH_TLS_TERMINATION=proxy` the broker listens over plain HTTP and must be reachable only from the TLS-terminating proxy on the same host (a loopback-published port); that proxy must keep the callback query string and cookies out of its logs.
- The returned token is held by Decap in the editor browser. A compromise of the approved admin origin can therefore compromise that token.

Report suspected credential exposure by revoking the OAuth grant, rotating both broker secrets, invalidating active sessions, preserving sanitized evidence, and following OpenRedakt's incident process.

