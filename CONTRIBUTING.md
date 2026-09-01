# Contributing to Weather Widget

Thanks for considering contributing! This is a small plugin project, so contributions should be focused.

## How to contribute

1. **Open an issue** first. Describe what you want to change and why.
2. **Fork** the repo and create a branch: `feat/description` or `fix/description`.
3. **Make your changes**. Keep the plugin a single self-contained `plugin.js` file. No build step, no npm deps.
4. **Test**. Run both syntax checks:
   ```bash
   node --check plugin.js
   node -e "import('./plugin.js').then(()=>console.log('OK')).catch(e=>console.log(e.message))"
   ```
5. **Open a PR**. Link the issue, describe what changed, attach a screenshot if it affects the UI.

## Conventions

- **Commit messages**: conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)
- **Code**: hand-drawn inline SVG only, no chart libraries. Theme-aware (CSS vars, never hardcoded colors).
- **UI**: test in both light and dark themes. Keep the popover viewport-safe (max 88vh).
- **Data**: harden every API access with optional chaining + nullish fallbacks. Never expose the user's token or location data.

## What's in scope

- New weather data sources (e.g., rain alerts, air quality)
- UI refinements (layout, accessibility, responsive edge cases)
- Bug fixes for edge-case locations, timezone drift, or API changes

## What's out of scope

- Adding npm dependencies or a build pipeline (disk plugins can't bundle them)
- Break-the-monolith: the plugin must stay one file

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful and assume good faith.