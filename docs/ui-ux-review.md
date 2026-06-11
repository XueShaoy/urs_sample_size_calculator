# URS DS Tools — 全平台 UI/UX 审查报告

> 审查日期：2026-06-10
> 审查范围：首页 + 4 个工具页 + MDE 业务指南

---

## 一、平台概览

| 页面 | 路径 | 架构 |
|------|------|------|
| 首页 | `index.html` | 单文件 inline |
| 样本量计算器 | `tools/sample-size/index.html` | ES Modules（`js/stats.js` / `js/pages.js` / `js/ui.js`） |
| 显著性检验 | `tools/significance-test/index.html` | 单文件 inline |
| 功效分析 | `tools/power-analysis/index.html` | 单文件 inline |
| 序贯检验 | `tools/sequential-test/index.html` | 单文件 inline |
| MDE 业务指南 | `tools/sample-size/mde-business-guide.html` | 纯文档页 |

共同特征：暗色主题、Google Fonts（Noto Sans SC + JetBrains Mono）、GA 追踪、changelog 水印。

---

## 二、跨页面一致性问题 🔴

### 2.1 无共享 CSS — 最高优先级

每个 HTML 文件完整复制了一整套设计系统（CSS 变量、卡片样式、按钮样式、tooltip、响应式断点等）。修改一个变量需要同步 5+ 个文件，维护成本高且容易遗漏。

**现状：** 各页面的 `:root` 变量、卡片/按钮/tooltip/form 样式均为 inline copy-paste。

**建议：** 抽取 `assets/styles.css`，包含设计令牌（变量）、基础组件样式、响应式断点，各页面通过 `<link>` 引用。

### 2.2 `prefers-reduced-motion` 缺失

仅 sample-size 工具页实现了 `@media (prefers-reduced-motion: reduce)` 来禁用动画。其余 3 个工具页（significance-test、power-analysis、sequential-test）和首页均有 fadeIn 动画但不尊重用户的系统减动偏好。

**建议：** 为所有动画统一添加 `prefers-reduced-motion` 回退。

### 2.3 Tooltip 类名不一致

| 页面 | 类名 |
|------|------|
| sample-size | `tip-bottom` |
| significance-test | `tip-down` |
| power-analysis | `tip-down` |
| sequential-test | `tip-down` |

同一功能（向下弹出的 tooltip）使用了两种命名。

### 2.4 Container 最大宽度不一致

| 页面 | max-width |
|------|-----------|
| sample-size | 1200px |
| significance-test | 1200px |
| power-analysis | **1100px** |
| sequential-test | **1100px** |
| 首页 | 1200px |
| mde-business-guide | **980px** |

### 2.5 h1 渐变色方向不一致

| 页面 | 渐变方向 |
|------|----------|
| sample-size | cyan → blue → purple |
| significance-test | cyan → blue → purple |
| power-analysis | **green → cyan → blue** |
| sequential-test | **blue → purple → cyan** |
| 首页 | cyan → blue → purple |

### 2.6 结果数值字号不一致

| 页面 | 主结果字号 |
|------|-----------|
| sample-size | 3rem |
| significance-test | 1.8rem |
| power-analysis | 1.6rem |
| sequential-test | 1.5rem |

### 2.7 fadeIn 动画距离不一致

| 页面 | translateY |
|------|-----------|
| sample-size | 15px |
| significance-test | 15px |
| power-analysis | **8px** |
| sequential-test | **8px** |

### 2.8 Tooltip 宽度不一致

sequential-test 使用 260px，其余三个工具页使用 240px。

### 2.9 统计函数重复

`erf`、`normCDF`、`normInv` 在 significance-test、power-analysis、sequential-test 的 inline script 中各写一份。sample-size 已正确抽取到 `js/stats.js`。

---

## 三、可访问性问题 🔴

### 3.1 动画无减动偏好支持

（见 §2.2）

### 3.2 表单输入缺少 `<label>`

部分 input 使用 placeholder 代替 label，屏幕阅读器无法识别输入用途。所有 `<input>` 和 `<select>` 应关联 `<label>` 或使用 `aria-label`。

### 3.3 颜色不是唯一指示器

power-analysis 的统计卡片仅靠颜色区分"好"（绿）和"警告"（橙），缺少文字/图标辅助。significance-test 的结果标签列（"显著↑"/"不显著"）做得好，可作为参考。

### 3.4 SVG 图表缺少无障碍描述

power-analysis 和 sequential-test 的 SVG chart 缺少 `role="img"` + `<title>` 或 `aria-label`，屏幕阅读器无法理解图表内容。

### 3.5 键盘导航不完整

- scenario switch 使用 `role="tablist"` ✅（做得好）
- CSV 拖拽区对键盘用户不可用
- tooltip 仅 hover 触发，键盘用户无法查看

---

## 四、交互与体验问题 🟡

### 4.1 无全局 Loading 状态

所有工具点击"计算"后无 loading indicator。即使计算是同步的，也应给用户即时反馈（spinner 或按钮状态变化）。

### 4.2 sequential-test 决策横幅 CSS bug

`tools/sequential-test/index.html` 第 158-160 行：

```css
.decision-banner {
  display: none;
  /* ... */
  display: flex;
}
```

`display: none` 被紧随其后的 `display: flex` 覆盖，实际依赖 `.hidden` class 控制可见性。冗余 CSS 容易造成困惑。

### 4.3 power-analysis 无重置按钮

其余 3 个工具均有"重置"/"清空"功能，power-analysis 缺失。

### 4.4 mde-business-guide.html 无响应式

没有任何 `@media` 断点。在小屏幕上 hero 区域和 h1 可能溢出或显示拥挤。h1 使用 `32px` 而非 `rem`，与其他页面的 `2.25rem` 不一致。

### 4.5 mde-guide 无 changelog 水印

其余 5 个页面均加载了 `changelog.js` 和水印按钮，mde-guide 缺失。作为文档页可以豁免，但应明确决策。

### 4.6 工具间无快捷跳转

从工具页返回首页后，需再次点击才能进入另一个工具。可在工具页的导航区域添加"所有工具"下拉菜单。

### 4.7 移动端 home-link 行为不一致

| 页面 | 移动端 home-link 位置 |
|------|----------------------|
| sample-size | 移至左上角 |
| significance-test | 移至左上角 |
| power-analysis | 移至左上角 |
| sequential-test | **留在右上角** |

sequential-test 因无 scenario switch（不占用左上角），home-link 位置与其他页面不同。

### 4.8 Select 下拉框样式不统一

所有页面的 `<select>` 使用系统默认暗色样式，与 JetBrains Mono 输入框风格不完全匹配。可自定义 select 样式或统一切换为 radio button。

---

## 五、视觉设计问题 🟢

### 5.1 渐变过度使用

h1、场景切换按钮、结果卡片、卡片顶部线条均使用渐变。视觉噪音偏重，可适当简化。

### 5.2 Card overflow 处理复杂

sample-size 使用 `overflow: visible`（卡片）+ `overflow: hidden`（卡片 `::before`）的组合来支持 tooltip 显示，增加了维护复杂度。

### 5.3 结果卡片对比度

主结果卡片使用蓝紫渐变背景 + 3rem 白色文字，渐变色与白色的对比度可能不足。建议验证 WCAG AA 标准（4.5:1）。

### 5.4 移动端 scenario 按钮截断

420px 以下显示缩写文本（如"长期观测"→"观测"），缩写可能让用户困惑。

### 5.5 `.soon` 卡片样式未使用

首页定义了 `.soon`（coming soon）样式但当前无卡片使用。如果近期无新工具计划，可移除以减少 CSS 体积。

---

## 六、架构改进建议

### 6.1 抽取共享 CSS（最高 ROI）

将以下内容提取到 `assets/styles.css`：

- `:root` CSS 变量（颜色、阴影、间距）
- 通用卡片样式（`.card`、`.card-header`）
- 表单样式（`.form-grid`、`.form-group`、input/select）
- Tooltip 样式（统一命名和尺寸）
- 按钮样式（`.btn`、`.btn-primary`）
- 响应式断点（768px、420px）
- 动画关键帧（fadeIn、resultFlash）
- `prefers-reduced-motion` 回退

### 6.2 抽取共享 JS

将以下功能提取到 `assets/shared.js`：

- `normInv`、`erf`、`normCDF`、`pValue` 等统计工具函数
- Tooltip 初始化逻辑
- GA tracking 逻辑
- changelog 水印逻辑

> 注意：significance-test 已经是 inline script，迁移工作量最大，可作为后续优化。

### 6.3 统一动画系统

定义统一参数：

```css
:root {
  --anim-translate-y: 15px;
  --anim-duration: 0.4s;
  --anim-timing: ease;
}
```

### 6.4 添加 Loading 状态

在所有计算按钮点击后显示 spinner，即使计算是同步的：

```html
<button class="btn-primary" onclick="compute(this)">
  <span class="btn-text">计算</span>
  <span class="btn-spinner" hidden>⏳</span>
</button>
```

### 6.5 统一响应式断点

复用 sample-size 的双断点体系（768px + 420px），确保所有页面在 375px / 768px / 1024px / 1440px 下表现一致。

---

## 七、做得好的地方 ✅

| 特性 | 页面 | 说明 |
|------|------|------|
| 暗色主题 | 全局 | 数据工具适合暗色背景，降低视觉疲劳 |
| JetBrains Mono | 全局 | 数据展示可读性好 |
| CSS-only Tooltip | 全局 | 实现巧妙，无 JS 依赖 |
| LDBOM 页面选择器 + CSV 导入 | sample-size | 设计优秀，支持批量配置 |
| Forest plot | significance-test | SVG 内联渲染，信息密度高 |
| 交互式 SVG 图表 | power-analysis | Crosshair + tooltip + touch 支持 |
| 可折叠工具说明 | sequential-test | 渐进式信息披露 |
| `role="tablist"` 无障碍 | sample-size / significance / power | 场景切换键盘可访问 |
| 动态 per-page 配置面板 | sample-size | `initPageConfigs()` 运行时生成 |
| 表单验证 | 全局 | `role="alert"` + `aria-live="polite"` + 字段级错误提示 |
| changelog 水印系统 | 全局 | 版本管理 + 变更日志一体化 |

---

## 八、优先级排序

| 优先级 | 改进项 | 预估工作量 | 影响范围 |
|--------|--------|-----------|----------|
| 🔴 P0 | 抽取共享 CSS `assets/styles.css` | 中（2-3h） | 全平台 |
| 🔴 P0 | 统一 `prefers-reduced-motion` 支持 | 小（每页 5-10 行） | 全平台 |
| 🟡 P1 | 统一 container 宽度为 1200px | 小（改 2 个文件） | power / sequential |
| 🟡 P1 | 统一 tooltip 类名和宽度 | 小（批量替换） | 全平台 |
| 🟡 P1 | 添加 loading spinner | 小 | 全平台 |
| 🟡 P1 | mde-business-guide 添加响应式 | 小 | mde-guide |
| 🟡 P1 | 修复 sequential-test decision-banner CSS | 小 | sequential |
| 🟡 P1 | SVG 图表添加 aria-label | 小 | power / sequential |
| 🟢 P2 | 抽取共享 JS（统计函数） | 大（需重构 inline script） | significance / power / sequential |
| 🟢 P2 | 统一 fadeIn 动画参数 | 小 | 全平台 |
| 🟢 P2 | 统一结果值字号层级 | 小 | 全平台 |
| 🟢 P2 | 添加 focus-visible 样式 | 小 | 全平台 |
| 🟢 P2 | 工具间添加快捷跳转 | 小 | 全平台 |
| 🟢 P2 | 自定义 select 样式 | 中 | 全平台 |

---

## 九、附录：各页面详细审查

### A. 首页 (`index.html`)

- 单列居中布局，max-width 1200px
- 工具卡片 grid，hover 效果（translateY + shadow）
- 无导航栏，卡片即入口
- 缺少 `prefers-reduced-motion`
- `.soon` 样式已定义但未使用

### B. 样本量计算器 (`tools/sample-size/index.html`)

- 最复杂的页面（779 行），ES Modules 架构
- 双场景（长期观测 / AB 测试）+ 双模式（精度→样本量 / 样本量→精度）
- LDBOM 5 页面 per-page 配置 + CSV 导入
- tooltip 系统完善，`tip-bottom` 命名
- 唯一实现 `prefers-reduced-motion` 的页面
- `overflow: visible` + `overflow: hidden` 复杂组合

### C. 显著性检验 (`tools/significance-test/index.html`)

- 单文件 inline（1118 行），最重的文件
- 可编辑 HTML 表格 + CSV 导入
- Forest plot（SVG 内联）
- tooltip 类名 `tip-down`（与 sample-size 不一致）
- 缺少 `prefers-reduced-motion`
- 场景切换按钮使用相同渐变色（紫色→蓝色），区分度不如其他页面

### D. 功效分析 (`tools/power-analysis/index.html`)

- 单文件 inline（892 行）
- 交互式 SVG 图表（crosshair + touch 支持）
- h1 渐变方向为 green→cyan→blue（与其他页面不同）
- container 宽度 1100px（与其他页面不一致）
- fadeIn translateY 为 8px（与 sample-size 的 15px 不一致）
- 缺少重置按钮
- 缺少 `prefers-reduced-motion`

### E. 序贯检验 (`tools/sequential-test/index.html`)

- 单文件 inline（822 行）
- 可折叠"工具说明"卡片
- 决策横幅 CSS bug（display:none 被 display:flex 覆盖）
- h1 渐变方向为 blue→purple→cyan（与其他页面不同）
- container 宽度 1100px
- tooltip 宽度 260px（其他页面 240px）
- 移动端 home-link 留在右上角（与其他页面移到左上角不一致）
- 缺少 `prefers-reduced-motion`

### F. MDE 业务指南 (`tools/sample-size/mde-business-guide.html`)

- 纯文档页（356 行），MathJax 渲染公式
- 无响应式断点
- h1 使用 `32px` 而非 `rem`
- 无 changelog 水印
- 无 watermark 按钮
- `line-height: 1.75`（其他页面 1.7）
