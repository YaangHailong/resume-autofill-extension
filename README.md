# 简历自动填写助手

这是一个 Chrome Manifest V3 浏览器扩展。你先在扩展的“简历模板”页面填写结构化简历，然后在任意简历/求职申请网页中点击“扫描当前页”。插件会读取当前网页的表单字段，生成预览方案，确认后再自动填写。

插件默认只填写当前页面，不会自动提交表单，不会点击“下一步”，也不会把简历上传到云端。简历数据保存在浏览器本地的 `chrome.storage.local`。

## 一、项目能做什么

- 在扩展内维护一份结构化简历模板。
- 支持基本信息、教育经历、工作经历、实习经历、项目经历、技能、证书、语言、个人链接。
- 扫描网页中的 `input`、`textarea`、`select`、单选框、复选框、可编辑文本区域。
- 根据字段标签、占位提示、`name`、`id`、`aria-label`、邻近文本进行匹配。
- 在网页右上角显示填写预览，用户可以检查或调整字段映射。
- 确认后自动填写，不自动提交。
- 识别“添加证书”“新增项目”“Add certificate”等动态添加按钮。
- 根据模板中多条证书/项目/经历，确认后自动点击添加按钮，再重新扫描并填写新增字段。

## 二、目录结构

```text
.
├── public/manifest.json          Chrome MV3 扩展清单
├── src/background/               后台 service worker
├── src/content/                  注入网页的扫描、预览、填写逻辑
├── src/options/                  简历模板编辑页
├── src/popup/                    扩展弹窗入口
├── src/shared/                   简历类型、存储、匹配算法、消息类型
├── fixtures/forms/               本地模拟表单
├── tests/                        单元测试和 DOM fixture 测试
├── e2e/                          Playwright 测试骨架
├── scripts/build-content.cjs     content script 单文件打包脚本
└── dist/                         构建后的 Chrome 扩展目录
```

## 三、环境准备

推荐环境：

- Node.js 14 或更高版本。
- npm。
- Chrome 浏览器。

第一次使用时，在项目目录运行：

```bash
npm install
```

如果看到 `npm update check failed`，通常只是 npm 无法写入更新检查缓存，不影响安装和构建。

## 四、构建插件

运行：

```bash
npm run build
```

构建成功后，会生成 `dist` 目录。Chrome 加载扩展时选择这个目录：

```text
D:\桌面\简历插件\dist
```

注意：这个项目不是直接把源码目录加载进 Chrome，而是加载 `dist`。

## 五、在 Chrome 中安装

1. 打开 Chrome。
2. 地址栏输入 `chrome://extensions`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择 `D:\桌面\简历插件\dist`。
6. 安装成功后，浏览器工具栏会出现“简历自动填写助手”。

如果你修改了代码，需要重新运行 `npm run build`，然后在 `chrome://extensions` 中点击该扩展的“刷新”按钮。

## 六、具体使用流程

### 1. 填写简历模板

1. 点击 Chrome 工具栏里的扩展图标。
2. 点击“打开模板”。
3. 在模板页面填写简历信息。
4. 至少填写姓名、电话、邮箱等基础字段。
5. 如果有多个证书、项目或经历，点击对应模块里的“添加”。
6. 点击右上角“保存”。

模板支持 JSON 备份：

- 点击“导出 JSON”可以把当前模板显示为 JSON。
- 粘贴 JSON 后点击“导入到表单”可以恢复模板。

### 2. 扫描目标网页

1. 打开一个简历填写网页或求职申请网页。
2. 点击 Chrome 工具栏里的扩展图标。
3. 点击“扫描当前页”。
4. 插件会在网页右上角打开“简历自动填写预览”面板。

### 3. 检查预览结果

预览面板会显示：

- 确定：插件认为匹配很明确的字段。
- 需确认：有一定相似度，但建议人工检查。
- 未匹配：没有找到合适的网页字段。
- 动态添加：需要点击“添加证书/项目/经历”的次数。

每一行都可以在下拉框里选择目标网页字段。如果不想填写某一项，选择“不填写”。

### 4. 确认填写

确认无误后点击“确认并填写”。

插件会：

1. 按预览计划填写当前页面。
2. 如果有动态添加计划，先点击添加按钮。
3. 等待页面更新。
4. 重新扫描新增字段。
5. 填入对应数据。

插件不会自动提交表单。填写完成后，请你自己检查页面内容，再手动保存或提交。

## 七、本地模拟测试

项目提供了两个测试网页：

```text
fixtures/forms/chinese-resume.html
fixtures/forms/english-application.html
```

手动测试方式：

1. 先运行 `npm run build`。
2. 在 Chrome 加载 `dist` 扩展。
3. 用 Chrome 打开 `fixtures/forms/chinese-resume.html`。
4. 在扩展里保存一份包含证书的简历模板。
5. 点击“扫描当前页”。
6. 检查预览面板。
7. 点击“确认并填写”。
8. 确认姓名、手机号、邮箱、证书等字段被写入。

## 八、开发调试

启动本地开发服务：

```bash
npm run dev
```

常用地址：

```text
http://127.0.0.1:5173/options.html
http://127.0.0.1:5173/popup.html
```

这两个地址只适合调试页面 UI。真正的 Chrome 扩展能力，比如 popup 调用当前标签页、content script 注入网页，需要构建后加载 `dist` 测试。

## 九、验证命令

类型检查：

```bash
npm run typecheck
```

单元测试和 DOM fixture 测试：

```bash
npm test
```

构建：

```bash
npm run build
```

Playwright e2e 测试：

```bash
npx playwright install chromium
npm run test:e2e
```

如果没有安装 Playwright Chromium，`npm run test:e2e` 会提示先运行 `npx playwright install chromium`。

## 十、实现要点

### 为什么 content script 单独打包

Vite 多入口构建时可能会把共享代码拆成 chunk，例如生成 `import "./storage.js"`。普通页面入口可以这样加载，但 Chrome `content_scripts` 里声明的脚本不适合依赖这种拆分入口。

因此本项目采用：

- Vite 构建 `popup`、`options`、`background`。
- `scripts/build-content.cjs` 用 esbuild 把 `src/content/index.ts` 单独打包成 IIFE。
- `manifest.json` 直接引用 `assets/content.js`。

### 为什么先预览再填写

不同招聘网站的字段命名差异很大。直接一键填写容易误填，所以第一版采用“扫描 -> 预览 -> 用户确认 -> 填写”的流程，在效率和安全之间取得平衡。

### 为什么不自动提交

简历属于敏感信息，求职表单也可能包含法律声明、隐私授权、附件上传等步骤。插件只负责填入字段，最终保存或提交由用户自己决定。

## 十一、常见问题

### 点击“扫描当前页”没有反应

可能原因：

- 当前页面是 `chrome://` 这类浏览器内置页面，Chrome 不允许注入 content script。
- 扩展没有刷新到最新构建版本。
- 当前网页有 iframe 或复杂前端隔离，第一版只处理主文档里的常规字段。

处理方式：

1. 切换到普通网页。
2. 重新运行 `npm run build`。
3. 到 `chrome://extensions` 刷新扩展。
4. 再点击“扫描当前页”。

### 字段匹配不准确

在预览面板里手动选择正确字段。插件会把这个选择作为当前网站的映射偏好保存，下次同域名可以复用。

### 多条证书没有全部填上

确认目标网页是否有“添加证书”“新增证书”之类按钮。第一版会识别常见中文和英文添加按钮，但对完全自定义按钮可能需要后续增加规则。

### 修改代码后 Chrome 里没有变化

需要重新构建并刷新扩展：

```bash
npm run build
```

然后在 `chrome://extensions` 点击扩展卡片上的刷新按钮。

## 十二、后续可扩展方向

- 支持更多网站专用规则。
- 支持附件上传提示，但仍不自动上传敏感文件。
- 支持导入 PDF/DOCX 简历后生成结构化模板。
- 增加字段映射编辑器。
- 增加撤销填写或填写前快照。
- 增加 iframe 表单扫描。
- 增加更完整的 Playwright 扩展加载 e2e 测试。
