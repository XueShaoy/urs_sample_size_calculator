# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A multi-tool statistical analysis suite (Chinese-language UI) for the URS Data Science team. Deployed via GitHub Pages at `urs-ds.xueshaoyang.com`.

**Site structure — four self-contained HTML files, no build system, no dependencies:**
- `index.html` — Landing page linking to all four tools
- `sample-size-calculator.html` — Sample size / MDE calculator
- `significance-test.html` — Significance testing tool (z proportion tests)
- `power-analysis.html` — Statistical power vs. experiment duration charts
- `sequential-test.html` — Sequential testing / early stopping boundaries

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

- `getMinSample()` — reads the `#min-sample` input (default 200) and returns the current floor for all computed sample sizes; formerly a hardcoded constant `MIN_SAMPLE = 200`
- Default α = 0.2, default power = 0.7 (less conservative than typical academic defaults)
- `Z_CI = { 0.90: 1.645, 0.95: 1.960, 0.99: 2.576 }` — used to render CI half-widths at three confidence levels

### Non-obvious Implementation Details

**Input ID naming convention** — Form field IDs follow a predictable pattern:
- Monitoring inputs: `m{1|2}-p`, `m{1|2}-delta`, `m{1|2}-alpha`, `m{1|2}-power`, `m{1|2}-n`
- AB proportion inputs: `m{1|2}-ab-pA`, `m{1|2}-ab-pB`, `m{1|2}-ab-nA`, `m{1|2}-ab-delta`, etc.
- AB mean inputs: `m{1|2}-mean-sigmaA`, `m{1|2}-mean-sigmaB`, `m{1|2}-mean-nA`, etc.
- Per-page inputs (dynamically generated): `m{mode}-{page}-w`, `m{mode}-{page}-p`, `m{mode}-{page}-n`, `m{mode}-{page}-pA`, etc.

**Dynamic page config HTML** — The LDBOM per-page input panels do not exist in the static HTML. They are generated at runtime by `initPageConfigs()`, which is called on `DOMContentLoaded` and on every `switchScenario()`. When modifying per-page input fields, edit the template strings inside `initPageConfigs()`.

**AB Mode 1 asymmetry** — In Mode 1 AB tests, nA is always a user-supplied input; only nB is calculated. The formula `nB = VarB / [(δ/Z)² - VarA/nA]` requires nA first. If nA is large enough that `VarA/nA ≥ (δ/Z)²`, the result clamps to `getMinSample()` with a warning.

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
- **Odds Ratio column**: `calcOR(pNumerator, pDenominator)` computes OR = (pN/(1−pN)) / (pD/(1−pD)); displayed in table and CSV; returns `null` (renders "—") when p=0 or p=1
- **Observed power**: `calcPower()` computes post-hoc power using the observed effect size, displayed per row with color coding (≥80% green, <50% orange); column tooltip and formula section include the Hoenig & Heisey (2001) caveat that observed power is redundant with p-value
- **Forest plot**: SVG rendered inline showing point estimates with 95% CI bars
- **CSV export**: downloads results including OR, corrected p-values, power, and a metadata footer; `downloadResults()`
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

## sequential-test.html

Computes alpha-spending early stopping boundaries for sequential / interim analysis. Lets users determine whether a running experiment can be stopped early without inflating the overall Type I error rate.

Inputs: planned total N, optional daily traffic (to show days per look), K interim analyses, α, boundary type, test direction, and optionally the current accumulated n and z-statistic for a live stop/continue decision.

Two boundary types via `spendOBF()` and `spendPocock()`:
- **O'Brien-Fleming**: `α*(t) = 2×[1−Φ(z_{α/2}/√t)]` — early looks are very conservative, final boundary ≈ fixed-horizon z; minimal power loss
- **Pocock**: `α*(t) = α×ln(1+(e−1)×t)` — equal boundaries at every look; final boundary is higher than fixed-horizon, requires ~10–30% more total N

Key functions: `computeBoundaries(alpha, K, spendFn, tail)` returns an array of look objects `{k, t, cumSpent, deltaAlpha, z, boundaryP}`; `renderBoundaryChart()` draws the SVG boundary plot; `compute()` is the main entry point.

**Incremental α allocation** — At look k (t = k/K), cumulative α spent = `spendFn(α, t)`. The incremental budget for look k is `Δα_k = cumSpent(t_k) − cumSpent(t_{k-1})`, and the critical z-value is `normInv(1 − Δα_k / sides)`. This is the Lan-DeMets (1983) approximation — adequate for planning but not a substitute for exact simulation-based boundaries in formal trial design.

**Current-state decision** — When the user fills in current n and current z, `compute()` finds the nearest planned look by minimising `|t_observed − t_k|` and compares `|z_current|` against that look's boundary. A stop/continue banner and a horizontal z-line on the chart are shown.

**UI guide** — A collapsible "工具说明" card above the parameters panel (toggled by `toggleGuide()`) explains the peeking problem, when to use the tool, the four-step workflow, and a side-by-side comparison of the two boundary types. A "结果解读" panel inside the results section (rendered dynamically into `#interp-text`) explains how to read each output element and lists three critical caveats (no mid-experiment look additions, no retroactive application, winner's curse on early-stop effect estimates).
