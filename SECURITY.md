# Security Policy

## Supported Versions

SIGNAL is self-hosted and single-user. Only the latest release is actively maintained.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email: security@signal.dev (or open a [private security advisory](https://github.com/Alnoorcapital/signal/security/advisories/new) on GitHub).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You'll receive an acknowledgement within 48 hours. We aim to ship a fix within 7 days for critical issues.

## Scope

SIGNAL is designed for **self-hosted, single-user, local-network deployment**. It has no authentication by design. If you expose the server publicly, that is outside the intended use case and you do so at your own risk.

The following are **in scope**:
- Server-side code injection (command injection, SQL injection)
- XSS in the dashboard or extension
- Sensitive data leakage (API keys in logs, responses)
- Extension permission escalation

The following are **out of scope** for this project:
- Brute-force attacks on an unprotected public deployment (auth is out of scope by design)
- Denial-of-service against a publicly exposed instance
