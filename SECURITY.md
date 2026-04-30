# Security Policy

## Supported Versions

SIGNAL is self-hosted and single-user. Only the latest release is actively maintained.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email: security@signal.dev (or open a [private security advisory](https://github.com/moayobai/signal/security/advisories/new) on GitHub).

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You'll receive an acknowledgement within 48 hours. We aim to ship a fix within 7 days for critical issues.

## Scope

SIGNAL is designed for **self-hosted, single-user deployment**. Dashboard, API, and WebSocket routes require `SIGNAL_AUTH_TOKEN` unless `SIGNAL_AUTH_DISABLED=true` is set explicitly for local development or tests. Public deployments should keep auth enabled, use HTTPS, rotate the token if it is shared, and keep provider API keys in the host secret store.

The following are **in scope**:

- Server-side code injection (command injection, SQL injection)
- XSS in the dashboard or extension
- Sensitive data leakage (API keys in logs, responses)
- Extension permission escalation
- Broken access control on dashboard, API, or WebSocket routes

The following are **out of scope** for this project:

- Brute-force attacks against weak or shared operator-provided auth tokens
- Denial-of-service beyond the built-in per-instance rate limit
