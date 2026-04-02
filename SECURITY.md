# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Knowtis, please report it responsibly through [GitHub's private vulnerability reporting](https://github.com/jovandyaz/knowtis_app/security/advisories/new).

**Please do not open a public issue for security vulnerabilities.**

## Response Timeline

- **Acknowledgment**: Within 48 hours of your report
- **Assessment**: Within 1 week, we will provide an initial assessment and expected timeline for a fix
- **Resolution**: Security patches are prioritized and released as soon as possible

## Scope

The following areas are in scope for security reports:

- Authentication and authorization (JWT, session handling)
- Cross-site scripting (XSS)
- Injection vulnerabilities (SQL, NoSQL, command)
- Data exposure or leakage
- CRDT/collaboration protocol vulnerabilities
- WebSocket security issues

## Out of Scope

- Vulnerabilities in third-party dependency code that are not specific to how Knowtis uses them (report to the upstream project). Reports about Knowtis using a known-vulnerable version of a dependency are in scope
- Social engineering attacks
- Denial of service (DoS) attacks
- Issues requiring physical access to a user's device

## Disclosure Policy

We follow a 90-day coordinated disclosure policy. We ask that you:

1. Give us up to 90 days from the initial report to release a fix before any public disclosure
2. Make a good faith effort to avoid privacy violations, data destruction, and disruption of service
3. Do not access or modify data that does not belong to you

We will credit reporters in the security advisory unless they prefer to remain anonymous.
