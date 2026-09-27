# Security policy

Dispatch handles email and mailbox credentials, so we take security reports seriously and appreciate responsible disclosure.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately through GitHub: **[Report a vulnerability](https://github.com/codextde/dispatch/security/advisories/new)**. Only the maintainers can see the report.

Please include:

- A description of the issue and its impact
- Steps to reproduce or a proof of concept
- The affected version (`/api/health` shows it) and deployment type
- Any suggestions for a fix

What to expect:

| Step | Target |
| --- | --- |
| Acknowledgement | within 3 business days |
| Initial assessment and severity | within 7 days |
| Fix for critical/high issues | as fast as possible, typically within 30 days |

We'll keep you updated, coordinate the disclosure date with you, and credit you in the advisory unless you prefer to stay anonymous.

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x (latest minor) | Yes |
| Older releases | Please upgrade |

Security fixes are released as patch versions and published as [GitHub security advisories](https://github.com/codextde/dispatch/security/advisories). Watch the repository (*Custom → Security alerts*) to be notified.

## Scope

In scope: the Dispatch application, worker, Docker image and the configuration shipped in this repository.

Out of scope:

- Vulnerabilities in third-party services (Stripe, Google, Microsoft, mail providers) — report them to the vendor
- Issues that require a compromised server, a malicious super admin, or physical access
- Missing hardening on instances where the operator turned it off (e.g. *Block private networks* disabled on a private instance)
- Denial of service through volume, and social engineering

Please don't access or modify other users' data, degrade the service, or test against instances you don't own. Use a local installation ([development guide](docs/development.md)).

For how Dispatch protects data, see [docs/security.md](docs/security.md).
