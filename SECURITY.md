# Security policy

This is early community software; review it before granting production management access.
Report security issues privately through GitHub's private vulnerability reporting if enabled,
or contact the maintainer before opening an issue containing sensitive information.
Never put tokens, customer bot payloads or internal configuration in public reports.

Incoming authorization, Typebot credentials and snapshot receiver credentials are separate.
Use TLS, private backend networking, least-privilege Typebot access and filesystem backups.
Read the concurrency, snapshots, preview effects and webhook egress limitations in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). A tool annotation is not an access policy.
Dependencies are locked; check `npm audit` and tests before upgrades.
