# AI 语义匹配接入说明

这份文档记录后续接 AI API 时需要准备什么，以及为什么不要把火山方舟 API key 直接放进 Chrome 扩展。

## 当前状态

当前项目已经有本地三层匹配：

1. 关键词规则匹配。
2. 字段语义匹配，例如学历、学位、专业、职位、城市等。
3. 下拉选项语义判断，例如页面标签写“学位”，但选项是“本科/硕士研究生”，会判断为学历字段。

AI 不应该替代这些本地规则，而应该只处理低置信度字段。

## 接 AI 时需要准备

### 1. 后端服务

不要把 AI API key 写进 Chrome 扩展。扩展代码和打包后的 `dist` 都可以被用户查看，key 会泄露。

需要准备一个后端服务，例如：

- 当前项目提供的 Node.js 本地示例：`scripts/ark-match-server.cjs`
- Cloudflare Workers
- Vercel Serverless Function
- 其他你能部署 HTTPS API 的服务

扩展只请求你自己的后端，后端再调用火山方舟 API。

当前默认本地后端地址：

```text
http://127.0.0.1:8787/api/resume-field-match
```

### 2. 环境变量

后端需要配置：

```text
ARK_API_KEY=你的火山方舟 API Key
AI_MATCHING_MODEL=doubao-seed-2-0-code-preview-260215
```

也可以用 `ARK_MODEL` 覆盖模型名。当前默认模型已经设置为：

```text
doubao-seed-2-0-code-preview-260215
```

本地启动示例：

```bash
# PowerShell
$env:ARK_API_KEY="你的火山方舟 API Key"
npm run ark:server
```

```bash
# Git Bash
ARK_API_KEY="你的火山方舟 API Key" npm run ark:server
```

### 3. API 地址

扩展侧需要知道你的后端地址，例如：

```text
https://your-domain.com/api/resume-field-match
```

如果本地调试，可以先用默认值：

```text
http://127.0.0.1:8787/api/resume-field-match
```

正式 Chrome 扩展发布时建议使用 HTTPS。

扩展的 options 页面里已经有：

- `启用 AI 兜底匹配`
- `后端接口地址`

保存后，点击 popup 的“扫描当前页”就会在本地规则匹配后调用该后端。

### 4. 请求数据

为了隐私，发送给 AI 的数据应该尽量脱敏。建议只发送字段结构，不发送真实手机号、邮箱等敏感值。

示例：

```json
{
  "origin": "https://zhaopin.xdf.cn",
  "resumeFields": [
    {
      "path": "education.items[0].educationLevel",
      "label": "学历",
      "fieldKey": "educationLevel",
      "section": "education",
      "semanticHints": ["education_level"]
    }
  ],
  "pageFields": [
    {
      "id": "field-12",
      "labelText": "学位",
      "placeholder": "请选择",
      "kind": "select",
      "sectionHint": "education",
      "options": ["本科", "硕士研究生", "博士研究生"]
    }
  ]
}
```

### 5. 返回数据

AI 只返回映射建议，不直接填写页面。

示例：

```json
{
  "mappings": [
    {
      "resumePath": "education.items[0].educationLevel",
      "candidateId": "field-12",
      "confidence": 86,
      "reason": "页面字段写作学位，但下拉选项是本科/硕士研究生，更接近学历。"
    }
  ]
}
```

### 6. 扩展权限

如果扩展要请求你的后端，需要在 `public/manifest.json` 里添加后端域名的 host permission，例如：

```json
{
  "host_permissions": [
    "https://your-domain.com/*"
  ]
}
```

当前项目为了方便调试已经使用 `<all_urls>`，后续发布时可以收窄成自己的后端域名和目标招聘网站域名。

### 火山方舟调用方式

当前本地后端使用火山方舟 Chat Completions 接口：

```text
POST https://ark.cn-beijing.volces.com/api/v3/chat/completions
Authorization: Bearer $ARK_API_KEY
```

后端请求体核心结构和你提供的示例一致，只是这里发送的是文本匹配任务，不发送图片：

```json
{
  "model": "doubao-seed-2-0-code-preview-260215",
  "temperature": 0,
  "messages": [
    {
      "role": "system",
      "content": "You are a conservative resume form field matcher. Return JSON only."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "这里是脱敏后的简历字段和网页字段 JSON"
        }
      ]
    }
  ]
}
```

后端会要求模型只返回：

```json
{
  "mappings": [
    {
      "resumePath": "education.items[0].educationLevel",
      "candidateId": "field-12",
      "confidence": 86,
      "reason": "页面标签写作学位，但选项是本科/硕士研究生，更接近学历。"
    }
  ]
}
```

并且会校验 `resumePath` 和 `candidateId` 必须来自请求，避免 AI 编造字段。

### 7. 用户确认

AI 返回结果后仍然进入预览面板：

```text
本地规则匹配
  -> 低置信度字段请求 AI
  -> AI 返回建议
  -> 预览面板展示
  -> 用户确认
  -> 插件填写
```

不能让 AI 结果绕过人工确认。

## 推荐接入顺序

1. 先完善本地语义匹配。
2. 增加后端 API。
3. 扩展里增加“启用 AI 增强匹配”的开关。
4. 只把 `unmatched` 和 `needs-review` 字段发给 AI。
5. AI 返回结果后合并到 `FillPlan`。
6. 保留预览确认和用户手动修正。

## 面试说法

可以这样讲：

这个项目没有一开始就把所有匹配交给 AI，因为简历字段填写需要稳定和可解释。我的设计是先用规则和语义词典处理高确定性字段，再把低置信度字段交给 AI 做兜底。AI 的输入会脱敏，只包含字段标签、类型、选项和区块信息，不发送手机号、邮箱等真实简历内容。最终 AI 结果也不会自动执行，仍然需要用户在预览面板确认。
