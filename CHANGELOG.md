# Changelog

## v1.0.1 (2026-09-01)

### Fixed
- Location not found: show a cleaner "Not found - try a different city" message (place no longer repeated)
- Version banner aligned to the v1.0.1 release

---

## v1.0.0 (2026-08-28)

First public release.

### Features
- Titlebar widget: current temperature + condition icon, click to open
- Popover with 4 collapsible sections: Current, Hourly (24h scroll), Forecast (5d), Historical charts (7d/30d/12m)
- Auto-location via IP (opt-in, ipwho.is) or manual city entry
- Up to 3 saved locations for quick switching
- °C/°F + km/h/mph toggle
- Theme-aware (CSS variables, no hardcoded colors)
- Zero dependencies, hand-drawn inline SVG historical charts
- Safe by default: null-hardened API calls, escape hatches for every loading state