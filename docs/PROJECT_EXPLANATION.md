# 项目面试说明文档：简历自动填写助手

这份文档用于面试时介绍项目。建议按“项目背景 -> 架构 -> 核心难点 -> 验证 -> 改进方向”的顺序讲，听起来会比较完整。

## 1. 项目一句话介绍

这是一个 Chrome Manifest V3 浏览器扩展，用来把用户本地维护的结构化简历，自动匹配并填写到招聘网站或申请网页的表单中。

项目强调两个原则：

- 安全：先预览再填写，不自动提交表单，不上传简历数据。
- 通用：不绑定某一个招聘平台，而是通过字段扫描和关键词匹配适配不同网页。

## 2. 为什么做这个项目

求职时经常要在不同平台重复填写简历信息，例如姓名、手机号、邮箱、教育经历、证书、项目经历等。很多网页的字段结构不同，有的还需要点击“添加证书”“添加项目”才能出现更多输入框。

这个项目想解决三个问题：

- 降低重复填写简历的时间成本。
- 保留用户确认环节，避免误填。
- 支持动态新增区块，处理多证书、多项目、多经历场景。

## 3. 技术栈

- Chrome Manifest V3
- TypeScript
- React
- Vite
- esbuild
- chrome.storage.local
- jsdom 单元测试
- Playwright e2e 测试骨架

## 4. 整体架构

项目分为四个扩展入口：

```text
popup
  用户点击扩展图标后的入口，负责触发扫描当前页、打开模板页。

options page
  简历模板编辑页面，负责录入和保存结构化简历。

content script
  注入到目标网页，负责扫描字段、生成预览面板、执行填写。

background service worker
  扩展后台，负责打开 options 页面和处理基础消息。
```

共享逻辑放在 `src/shared`：

- `types.ts`：定义简历、网页字段、匹配结果、填写计划等类型。
- `resume.ts`：创建默认简历、扁平化简历字段。
- `fieldDictionary.ts`：中文/英文关键词词典。
- `matcher.ts`：字段匹配和动态添加计划生成。
- `storage.ts`：封装 `chrome.storage.local`。

## 5. 核心流程

用户操作流程：

```text
填写简历模板
  -> 保存到 chrome.storage.local
  -> 打开目标网页
  -> popup 点击扫描当前页
  -> content script 扫描 DOM
  -> matcher 生成 FillPlan
  -> 页面右上角显示预览面板
  -> 用户确认或调整映射
  -> 自动填写字段
  -> 如有动态区块，点击添加按钮后重新扫描填写
```

## 6. 简历数据设计

简历数据使用结构化 schema，而不是直接解析 PDF 或 DOCX。

原因：

- 自动填写需要稳定字段，例如 `basics.email`、`certificates.items[0].name`。
- PDF/DOCX 解析误差较大，不适合作为第一版核心。
- 结构化数据便于多条教育、证书、项目、经历的动态填写。

主要类型是：

```text
ResumeProfile
  basics
  education
  work
  internships
  projects
  skills
  certificates
  languages
  links
```

填写前会把结构化简历扁平化成 `ResumeFlatField`，例如：

```text
basics.fullName -> 姓名 -> 张三
basics.email -> 邮箱 -> zhangsan@example.com
certificates.items[0].name -> 证书名称 #1 -> PMP
```

这样 matcher 可以逐个字段寻找网页控件。

## 7. 网页字段扫描

content script 会扫描：

- `input`
- `textarea`
- `select`
- `checkbox`
- `radio`
- `[contenteditable="true"]`
- `[role="textbox"]`

每个控件会转成 `FieldCandidate`：

```text
selector
kind
labelText
placeholder
name
idAttr
ariaLabel
contextText
options
sectionHint
```

字段标签来源包括：

- `label[for]`
- 包裹式 `label`
- `aria-labelledby`
- 上一个兄弟节点文本
- 父级和祖先节点中的上下文文本

## 8. 匹配算法

匹配算法不是 AI 模型，而是可解释的启发式打分。

每个简历字段和每个网页字段都会计算分数：

- label 命中关键词，分数最高。
- placeholder 命中关键词，分数较高。
- `name` / `id` / `aria-label` 命中关键词，分数中等。
- 邻近文本命中关键词，分数较低。
- 字段类型匹配会加分，例如 email 对 `input[type=email]`。
- section 语境匹配会加分，例如证书字段优先匹配证书区域。
- select 的 option 文本和目标值接近也会加分。

最后按阈值分成：

- `confirmed`：确定匹配。
- `needs-review`：需要确认。
- `unmatched`：未匹配。

为了避免两个简历字段填到同一个网页控件，匹配时会维护 `usedCandidateIds`，已经使用的网页字段不会再分配给其他简历字段。

## 9. 动态添加区块

很多网页默认只显示一条证书或项目，需要点击“添加证书”才出现更多输入框。

本项目通过 `SectionAddPlan` 处理：

1. 统计简历模板里某个模块有多少条有效数据。
2. 根据当前网页字段估算页面已有几条。
3. 扫描按钮文本和上下文，寻找“添加证书”“新增项目”“Add certification”等按钮。
4. 计算需要点击几次。
5. 用户确认后执行点击。
6. 等待 DOM 更新。
7. 重新扫描字段并生成新的填写计划。

为了防止误识别导致无限点击，单个模块设置了最大添加次数。

## 10. 预览面板设计

预览面板由 content script 注入到页面右上角，并使用 Shadow DOM 隔离样式。

预览面板提供：

- 匹配统计。
- 动态添加计划。
- 每个简历字段对应的网页字段。
- 手动下拉选择目标字段。
- “不填写”选项。
- “重新扫描”按钮。
- “确认并填写”按钮。

用户手动选择的映射会保存为 `UserMappingOverride`，按当前网站 origin 记忆，下一次扫描同一网站时优先使用。

## 11. 隐私与安全设计

这个项目没有后端服务。

安全边界：

- 简历数据只保存到 `chrome.storage.local`。
- 不把简历数据上传到服务器。
- 不自动提交表单。
- 不自动点击下一步。
- 动态添加也需要用户在预览面板确认。
- 对未匹配字段明确显示，不强行填写。

面试时可以强调：因为简历包含手机号、邮箱、教育经历等敏感信息，所以第一版宁可牺牲一点自动化程度，也保留人工确认。

## 12. 构建方案和踩坑

项目使用 Vite 构建 React 页面，但 content script 采用 esbuild 单独打包。

原因是 Vite 多入口构建会进行 chunk 拆分，可能让 content script 顶部出现：

```js
import { ... } from "./storage.js";
```

Chrome 的 manifest content script 更适合声明一个直接可执行的脚本文件。如果 content script 依赖拆分 chunk，加载和路径管理容易出问题。

最终方案：

- `vite build` 构建 popup、options、background。
- `scripts/build-content.cjs` 用 esbuild 把 content script 打包为 IIFE。
- `manifest.json` 中 `content_scripts` 只引用 `assets/content.js`。

这是项目中比较值得讲的工程化细节。

## 13. 测试设计

当前验证包括：

- TypeScript 类型检查。
- 简历 schema 默认值测试。
- 中文字段匹配测试。
- 字段冲突去重测试。
- 动态证书添加计划测试。
- input、textarea、select 实际写入测试。
- 本地中文/英文模拟表单 fixture。
- Playwright e2e 测试骨架。

已通过：

```text
npm run typecheck
npm test
npm run build
```

## 14. 项目亮点

面试时可以重点讲这些：

- Chrome MV3 扩展完整工程结构，不只是网页 demo。
- 使用结构化简历数据，适合自动化填写。
- 字段扫描覆盖 label、placeholder、属性、上下文。
- 匹配算法可解释，能展示置信度和原因。
- 预览确认机制降低误填风险。
- 支持动态添加证书/项目/经历区块。
- 使用 Shadow DOM 注入预览面板，减少样式冲突。
- content script 单文件打包，解决 Vite chunk 拆分问题。
- 有测试覆盖核心算法和 DOM 填写行为。

## 15. 可以承认的不足

这些不足可以主动说，显得真实：

- 第一版不处理 iframe 内部表单。
- 第一版不解析 PDF/DOCX 简历。
- 复杂低代码平台或自定义组件可能需要专门适配。
- 匹配算法是启发式规则，不是语义模型。
- e2e 测试还可以进一步扩展成真正加载 Chrome 扩展的完整链路。

## 16. 后续优化方向

- 增加 iframe 扫描。
- 增加网站级规则配置。
- 增加更强的字段语义匹配。
- 支持导入 PDF/DOCX 后生成结构化简历。
- 增加填写前快照和撤销能力。
- 增加附件上传提醒。
- 增加更完整的 Playwright extension e2e。

## 17. 面试回答示例

### Q：为什么不用 AI 直接识别网页？

可以回答：

第一版我选择了可解释的规则匹配，因为浏览器扩展要直接操作用户页面，误填成本比较高。规则匹配能给出明确原因，比如 label 命中“邮箱”、input type 是 email。后续可以在规则匹配的基础上引入语义模型，但仍然保留预览确认。

### Q：为什么不自动提交？

可以回答：

简历和求职表单包含敏感信息，而且提交前通常还有隐私授权、附件确认等步骤。为了安全，插件只做字段填写，最终提交由用户人工完成。

### Q：怎么处理多个证书？

可以回答：

简历模板里证书是数组。扫描页面时会识别添加按钮，生成 `SectionAddPlan`，计算需要添加几次。确认后点击添加按钮，等待 DOM 更新，再重新扫描新增字段并填写。

### Q：这个项目最难的点是什么？

可以回答：

难点不是把值写进 input，而是如何在不同网站上找到正确字段，并控制误填风险。我用了字段候选扫描、关键词打分、section 语境、置信度分级、预览确认和用户映射记忆来解决这个问题。

### Q：如果某个网站字段识别错了怎么办？

可以回答：

预览面板允许用户手动选择正确字段。用户的选择会按网站 origin 保存为 override，下次扫描同一个网站会优先使用这个映射。

# 问题

## 字段已经出现在下拉框里，为什么邮箱仍然显示未匹配？

### 现象

在某个简历填写网页中，页面左侧显示 `邮箱*`，右侧是邮箱输入框。插件扫描后，预览面板的下拉框里可以看到“邮箱”这个网页字段，但当前简历里的邮箱字段仍然显示“未匹配”。

这个现象说明：插件已经扫描到了网页字段，但自动匹配阶段没有把简历字段和网页字段绑定起来。

### 原因

这次问题主要有两个原因：

1. 网页是左右两列布局，`邮箱*` 和输入框不是标准的 `<label for="...">` 关系，也不是包裹式 `<label><input /></label>` 关系。
2. 输入框本身可能只有 `placeholder="邮箱"`。原来的算法对 placeholder 命中的加分是 40 分，但进入匹配的最低阈值是 42 分，所以即使“邮箱”看起来很明显，也会因为差 2 分被判为 `unmatched`。

换句话说，下拉框里能看到“邮箱”，代表 DOM 扫描阶段成功；自动显示“未匹配”，代表匹配打分阶段没有达到阈值。

### 解决方案

本次修复分两部分：

1. 增强 DOM label 识别。
   - 在 `src/content/domScanner.ts` 中增加相邻静态文本识别。
   - 当输入框没有标准 label 时，向上查找父级容器，并扫描当前控件左侧或前面的静态文本。
   - 对 `邮箱*` 这类文本清理 `*`、`：` 等符号，得到更干净的 label。

2. 调整匹配打分。
   - 在 `src/shared/matcher.ts` 中增加精确匹配逻辑。
   - 如果 placeholder 精确等于字段关键词，例如 `邮箱`、`姓名`、`电话`，直接给足够分数进入 `confirmed`。
   - 如果字段属性或 label 精确匹配，也比普通包含匹配给更高分。

### 测试验证

新增了两个测试：

- `placeholder 精确等于字段名时能匹配邮箱`
- `左右两列布局的相邻标签能匹配邮箱`

验证结果：

```text
npm run typecheck  通过
npm test           8 tests passed
npm run build      通过
```

### 面试时可以怎么说

可以这样解释：

这个问题暴露了自动填写项目里一个典型难点：扫描到字段不等于能准确匹配字段。很多网页并不会使用标准 label，而是用左右两列布局或者自定义组件。我的处理方式是把问题拆成两层：第一层增强 DOM 扫描，让插件能从相邻静态文本里提取 label；第二层优化匹配算法，让 placeholder 精确命中时获得更高置信度。修复后，我补了对应的 DOM fixture 测试，防止同类问题回归。
