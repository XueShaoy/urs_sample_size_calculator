# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A multi-tool statistical analysis suite (Chinese-language UI) for the URS Data Science team. Deployed via GitHub Pages at `urs-ds.xueshaoyang.com`.

**Site structure — three self-contained HTML files, no build system, no dependencies:**
- `index.html` — Landing page linking to the two tools
- `sample-size-calculator.html` — Sample size / MDE calculator
- `significance-test.html` — Significance testing tool (z proportion tests)

Open any file directly in a browser to develop — no server required.

## sample-size-calculator.html

Two scenarios:
- **Long-term Monitoring** (长期观测): Paired-sample, single-group proportion tests
- **AB Testing** (AB 测试): Independent two-sample tests for both proportion and mean metrics

Two calculation modes per scenario:
- **Mode 1**: Given precision (MDE) → compute required sample size
- **Mode 2**: Given sample size → compute detectable precision (MDE)

Key JavaScript structure:
- **Statistical core**: `normInv()` (rational approximation of inverse normal CDF), `getZ()`, `calcN_single()`, `calcMDE_single()`, `calcNB_given_nA_proportion()`, `calcNB_given_nA_mean()`, `calcMDE_ab_proportion()`, `calcMDE_ab_mean()`, weighted SE functions
- **UI state**: Global `scenario` and `metricType` variables control which input panels are visible
- **LDBOM page system**: 5 pages (L/D/B/O/M) with per-page weights and parameters for weighted SE calculations
- **GA tracking**: Google Analytics (G-KVLVZCEG29) fires on each calculation

### Key Constants

- `MIN_SAMPLE = 200` — floor for all computed sample sizes
- Default α = 0.2, default power = 0.7 (less conservative than typical academic defaults)
- `Z_CI = { 0.90: 1.645, 0.95: 1.960, 0.99: 2.576 }` — used to render CI half-widths at three confidence levels

### Non-obvious Implementation Details

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

## significance-test.html

Batch z proportion test tool. Users enter metric data via an editable table or by uploading/drag-dropping a CSV file.

Two test types (switched via top-left toggle):
- **单样本检验** (single-sample): tests observed proportion against a fixed baseline `p0`; input columns: `metric, x, n, p0`
- **双样本检验** (two-sample): compares two independent proportions; input columns: `metric, x1, n1, x2, n2`

Key features:
- **Multiple comparison corrections**: Bonferroni, Holm, Benjamini-Hochberg (BH), and none — applied via `adjustPValues()`
- **Observed power**: `calcPower()` computes post-hoc power using the observed effect size, displayed per row with color coding (≥80% green, <50% orange)
- **Forest plot**: SVG rendered inline showing point estimates with 95% CI bars
- **CSV export**: downloads results including corrected p-values, power, and a metadata footer; `downloadResults()`
- **Template download**: `downloadTemplate()` generates a correctly-formatted CSV for the active test type

Mock CSV files in the repo root serve as template examples:
- `mock-significance-single-sample.csv` — columns: `metric, x, n, p0`
- `mock-significance-two-sample.csv` — columns: `metric, x1, n1, x2, n2`

Key functions: `testSingle()`, `testTwo()`, `adjustPValues()`, `calcPower()`, `renderForest()`, `renderTable()`, `renderFormula()`, `runTest()`.

## power-analysis.html

Visualizes how statistical power and detectable MDE evolve over experiment duration.

Two scenarios (same toggle pattern as the other tools):
- **长期观测**: single-group test; n = dailyN × days
- **AB 测试**: equal-split two-sample test; nPerGroup = dailyN × days / 2

Inputs: daily traffic, baseline rate p₀, optional target MDE δ, α, target power, max days.

Two SVG charts rendered inline via `renderChart()`:
- **功效曲线** (green `#10b981`): power (%) vs days, with threshold line at target power and a marker dot at the crossing day; only shown when δ is provided
- **MDE 曲线** (cyan `#06b6d4`): detectable MDE (%) vs days at the target power, with an optional δ threshold line and marker at the day MDE drops to δ

Summary stat cards: days to reach target power, power at max days, MDE at max days, MDE on day 1.

Key functions: `calcPower()`, `calcMDE()`, `buildPowerCurve()`, `buildMDECurve()`, `renderChart()`, `findCrossDay()`, `findDropDay()`, `run()`.

**Statistical note** — `calcMDE()` for AB uses the approximation SE = √(2p₀(1−p₀)/n), treating pA ≈ pB ≈ p₀. `calcPower()` uses the exact pB = p₀ + δ. The two charts are mathematically consistent: the crossing day on both charts is the same value.
