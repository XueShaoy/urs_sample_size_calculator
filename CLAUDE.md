# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-page statistical sample size calculator (Chinese-language UI) for the URS Data Science team. Deployed via GitHub Pages from `index.html` on the `main` branch.

Two scenarios:
- **Long-term Monitoring** (长期观测): Paired-sample, single-group proportion tests
- **AB Testing** (AB 测试): Independent two-sample tests for both proportion and mean metrics

Two calculation modes per scenario:
- **Mode 1**: Given precision (MDE) → compute required sample size
- **Mode 2**: Given sample size → compute detectable precision (MDE)

## Architecture

Everything lives in a single `index.html` — HTML structure, CSS (in `<style>`), and JavaScript (in `<script>`). No build system, no dependencies, no bundler.

Key JavaScript structure:
- **Statistical core**: `normInv()` (rational approximation of inverse normal CDF), `getZ()`, `calcN_single()`, `calcMDE_single()`, `calcNB_given_nA_proportion()`, `calcNB_given_nA_mean()`, `calcMDE_ab_proportion()`, `calcMDE_ab_mean()`, weighted SE functions
- **UI state**: Global `scenario` and `metricType` variables control which input panels are visible
- **LDBOM page system**: 5 pages (L/D/B/O/M) with per-page weights and parameters for weighted SE calculations
- **GA tracking**: Google Analytics (G-KVLVZCEG29) fires on each calculation

## Development

Open `index.html` directly in a browser — no server required. To test changes, refresh the page.

## Key Constants

- `MIN_SAMPLE = 200` — floor for all computed sample sizes
- Default α = 0.2, default power = 0.7 (less conservative than typical academic defaults)
- `Z_CI = { 0.90: 1.645, 0.95: 1.960, 0.99: 2.576 }` — used to render CI half-widths at three confidence levels

## Non-obvious Implementation Details

**Input ID naming convention** — Form field IDs follow a predictable pattern:
- Monitoring inputs: `m{1|2}-p`, `m{1|2}-delta`, `m{1|2}-alpha`, `m{1|2}-power`, `m{1|2}-n`
- AB proportion inputs: `m{1|2}-ab-pA`, `m{1|2}-ab-pB`, `m{1|2}-ab-nA`, `m{1|2}-ab-delta`, etc.
- AB mean inputs: `m{1|2}-mean-sigmaA`, `m{1|2}-mean-sigmaB`, `m{1|2}-mean-nA`, etc.
- Per-page inputs (dynamically generated): `m{mode}-{page}-w`, `m{mode}-{page}-p`, `m{mode}-{page}-n`, `m{mode}-{page}-pA`, etc.

**Dynamic page config HTML** — The LDBOM per-page input panels do not exist in the static HTML. They are generated at runtime by `initPageConfigs()`, which is called on `DOMContentLoaded` and on every `switchScenario()`. When modifying per-page input fields, edit the template strings inside `initPageConfigs()`.

**AB Mode 1 asymmetry** — In Mode 1 AB tests, nA is always a user-supplied input; only nB is calculated. The formula `nB = VarB / [(δ/Z)² - VarA/nA]` requires nA first. If nA is large enough that `VarA/nA ≥ (δ/Z)²`, the result clamps to `MIN_SAMPLE` with a warning.

**Per-page MDE scaling** — When page configs are active, each page's effective MDE is `pageDelta = totalDelta / page.w`. Heavier-weighted pages are held to a tighter precision requirement.

**Weighted SE formula** — The aggregate SE across pages squares the weights: `SE = √(Σ wᵢ² × pᵢ(1-pᵢ)/nᵢ)`. This is intentional: weight represents the page's contribution to a composite metric, so variance compounds multiplicatively.

**A/B sync** — A single `document.addEventListener('input', ...)` handler (not per-field listeners) manages all A→B sync checkboxes for proportion, sigma, and per-page pA fields.

**Results visibility** — Results are shown/hidden by toggling the `.visible` class on `.results-section` elements (CSS handles the `display: none` / `display: block` with a fade-in animation).
