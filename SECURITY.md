# Security Policy

## Reporting a Vulnerability

The weather widget does not handle authentication, credentials, or sensitive user data, but if you discover a security issue, please report it privately.

**Do not open a public issue.** Instead, contact the maintainer directly via GitHub's private vulnerability reporting (repository Settings → Security → Private vulnerability reporting).

We aim to respond within **72 hours** and release a fix as soon as practical.

## Scope

This plugin runs inside Hermes Desktop (Electron renderer). It has no backend, no network server, and no persistent storage beyond `ctx.storage` (plugin-scoped key-value in the Hermes profile).

## Known concerns

- **IP geolocation**: When auto-location is enabled (default **off**, opt-in), the plugin calls `ipwho.is` with your public IP. This is disclosed in the UI and in the README. Disable auto-location to stop all IP lookups.
- **Data sources**: Open-Meteo (forecast) and ipwho.is (geolocation) are free, keyless, CORS-enabled APIs. No user data is sent to any other endpoint.