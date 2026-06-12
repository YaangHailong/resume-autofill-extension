const http = require("http");
const https = require("https");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const ARK_API_URL =
  process.env.ARK_API_URL || "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const ARK_MODEL =
  process.env.ARK_MODEL ||
  process.env.AI_MATCHING_MODEL ||
  "doubao-seed-2-0-code-preview-260215";
const MAX_REQUEST_BYTES = 1024 * 1024;

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    writeJson(res, 200, { ok: true, model: ARK_MODEL });
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/resume-field-match") {
    writeJson(res, 404, { error: "Not found" });
    return;
  }

  try {
    const requestId = createRequestId();
    const body = await readJsonBody(req);
    logMatchRequest(requestId, body);
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      console.warn(`[${requestId}] Missing ARK_API_KEY`);
      writeJson(res, 500, { error: "Missing ARK_API_KEY" });
      return;
    }

    console.log(`[${requestId}] Calling Ark API...`);
    const rawText = await callArkChatCompletion(apiKey, body);
    const parsed = parseJsonObject(rawText);
    const safeResponse = normalizeAiResponse(parsed, body);
    console.log(`[${requestId}] Ark matching finished: mappings=${safeResponse.mappings.length}`);
    writeJson(res, 200, safeResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ark-match-error] ${message}`);
    writeJson(res, 500, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Ark matching server listening on http://${HOST}:${PORT}`);
  console.log(`Model: ${ARK_MODEL}`);
});

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function callArkChatCompletion(apiKey, matchingPayload) {
  const url = new URL(ARK_API_URL);
  const requestBody = JSON.stringify({
    model: ARK_MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You are a conservative resume form field matcher. Return JSON only. Never invent candidate ids or resume paths."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildPrompt(matchingPayload)
          }
        ]
      }
    ]
  });

  const requestOptions = {
    method: "POST",
    hostname: url.hostname,
    path: `${url.pathname}${url.search}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Length": Buffer.byteLength(requestBody)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Ark API returned ${res.statusCode}: ${raw.slice(0, 300)}`));
          return;
        }

        try {
          const data = JSON.parse(raw);
          resolve(extractMessageText(data));
        } catch {
          reject(new Error("Ark API returned invalid JSON"));
        }
      });
    });

    req.on("error", reject);
    req.write(requestBody);
    req.end();
  });
}

function buildPrompt(payload) {
  return [
    "请根据简历字段和网页字段候选，判断哪些未匹配/需确认字段可以映射到网页字段。",
    "只返回 JSON，不要 Markdown，不要解释。",
    "返回格式：{\"mappings\":[{\"resumePath\":\"...\",\"candidateId\":\"...\",\"confidence\":0-100,\"reason\":\"简短中文原因\"}]}",
    "要求：",
    "1. 只能使用输入中存在的 resumePath 和 candidateId。",
    "2. 不确定时不要返回该字段。",
    "3. 学历通常是本科、硕士研究生、博士研究生；学位通常是学士、硕士、博士、无学位。",
    "4. 优先看 label、placeholder、sectionHint、options 和 semanticHints。",
    "5. 不要建议提交、下一步、隐私、备案等非表单字段。",
    "",
    "输入 JSON：",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}

function extractMessageText(data) {
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : undefined;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item.text === "string" ? item.text : ""))
      .filter(Boolean)
      .join("\n");
  }

  throw new Error("Ark API response missing message content");
}

function parseJsonObject(text) {
  const cleaned = String(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("AI response does not contain JSON");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeAiResponse(response, requestPayload) {
  const allowedPaths = new Set(
    Array.isArray(requestPayload.resumeFields)
      ? requestPayload.resumeFields.map((field) => field.path)
      : []
  );
  const allowedCandidateIds = new Set(
    Array.isArray(requestPayload.pageFields)
      ? requestPayload.pageFields.map((field) => field.id)
      : []
  );

  const mappings = Array.isArray(response.mappings)
    ? response.mappings
        .filter(
          (item) =>
            item &&
            allowedPaths.has(item.resumePath) &&
            allowedCandidateIds.has(item.candidateId)
        )
        .map((item) => ({
          resumePath: item.resumePath,
          candidateId: item.candidateId,
          confidence: clampConfidence(item.confidence),
          reason: String(item.reason || "AI 语义匹配建议。").slice(0, 180)
        }))
    : [];

  return { mappings };
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.min(95, Math.max(0, Math.round(number)));
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function createRequestId() {
  return `ark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function logMatchRequest(requestId, body) {
  const resumeCount = Array.isArray(body.resumeFields) ? body.resumeFields.length : 0;
  const pageCount = Array.isArray(body.pageFields) ? body.pageFields.length : 0;
  console.log(
    `[${requestId}] AI match request received: resumeFields=${resumeCount}, pageFields=${pageCount}`
  );
}
