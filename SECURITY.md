# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the HLE Home Assistant add-on, please report it responsibly.

**Email:** security@hle.world

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge your report within 48 hours and aim to provide a fix within 7 days for critical issues.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| < Latest | No       |

## Security Measures

- Container images are built on isolated ARC runners
- Multi-arch images built with Buildah (ARM) and Docker (amd64)
- Automated security scanning in CI
