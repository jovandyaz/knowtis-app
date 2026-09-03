# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Knowtis, please report it responsibly through [GitHub's private vulnerability reporting](https://github.com/jovandyaz/knowtis-app/security/advisories/new).

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

## Dependency Overrides

The `pnpm.overrides` block in [`package.json`](./package.json) contains deliberate constraints that protect against known supply-chain attacks and unpatched transitive vulnerabilities. **Do not "tidy up" the ranges without reading this section first** — some of them look unusual on purpose.

### Shai-Hulud worm guard (May 11, 2026)

A coordinated supply-chain attack ([GHSA-g7cv-rxg3-hmpx](https://github.com/advisories/GHSA-g7cv-rxg3-hmpx) / CVE-2026-45321) published malicious versions of the TanStack ecosystem on May 11, 2026, between 19:20 and 19:26 UTC. The malicious versions stole credentials from CI runners and developer machines.

The following overrides express the safe-version ranges as a union that intentionally excludes the compromised window:

| Package                  | Malicious versions    | Override range             | Why this shape                                                                                                            |
| ------------------------ | --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@tanstack/history`      | `1.161.9`, `1.161.12` | `<1.161.0 \|\| >=1.161.13` | Permits our current `1.139.x` AND any future patched release ≥ `1.161.13`, while blocking the exact compromised versions. |
| `@tanstack/react-router` | `1.169.5`, `1.169.8`  | `<1.169.0 \|\| >=1.169.9`  | Same shape — current `1.139.14` is allowed; only the malicious `1.169.5` / `1.169.8` window is blocked.                   |
| `@tanstack/router-core`  | `1.169.5`, `1.169.8`  | `<1.169.0 \|\| >=1.169.9`  | Same as above.                                                                                                            |

If a future migration moves the project past these ranges (e.g. adopting TanStack Router `1.170.x`), the override can be tightened to `>=1.169.9`. Until then, **leave the disjoint range intact** — collapsing it to a single contiguous range will silently re-admit the malicious versions on the next `pnpm install` without `--frozen-lockfile`.

### Transitive patch enforcement

The remaining `pnpm.overrides` entries (`ws`, `protobufjs`, `lodash`, `picomatch`, `path-to-regexp`, `seroval`, `rollup`, `multer`, `socket.io-parser`, `uuid`, `postcss`, `qs`, `fast-uri`, `immutable`, `ip-address`, `happy-dom`, `dompurify`, `yaml`, `@protobufjs/utf8`) force patched versions of transitive dependencies whose direct consumers haven't yet released compatible updates. Each entry corresponds to one or more advisories surfaced by `pnpm audit --prod`.

These can be relaxed or removed once the direct consumers ship versions that resolve to the patched floors naturally. Run `pnpm audit --prod` after any override removal to confirm no vulnerabilities resurface.

### Verifying the configuration

```bash
pnpm install --frozen-lockfile   # apply lockfile exactly
pnpm audit --prod                # report any remaining advisories
```
