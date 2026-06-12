import { enhanceFillPlanWithAi } from "../shared/aiMatching";
import { createFillPlan } from "../shared/matcher";
import {
  getAiMatchingSettings,
  getMappingOverrides,
  getResumeProfile,
  upsertMappingOverrides
} from "../shared/storage";
import {
  ExecuteFillOptions,
  FieldCandidate,
  FieldMapping,
  FillPlan,
  UserMappingOverride
} from "../shared/types";
import { scanAddButtons, scanPageFields } from "./domScanner";
import { executeFillWithDynamicAdds } from "./filler";

const HOST_ID = "resume-autofill-preview-host";

export async function openPreviewPanel(): Promise<void> {
  const profile = await getResumeProfile();
  const overrides = await getMappingOverrides();
  const aiSettings = await getAiMatchingSettings();
  const candidates = scanPageFields();
  const localPlan = createFillPlan(profile, candidates, scanAddButtons(), location.origin, overrides);
  const plan = await enhanceFillPlanWithAi(localPlan, candidates, aiSettings);
  renderPanel(plan, candidates, false);
}

function renderPanel(plan: FillPlan, candidates: FieldCandidate[], completed: boolean): void {
  const previous = document.getElementById(HOST_ID);
  previous?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.appendChild(createStyles());

  const panel = document.createElement("section");
  panel.className = "panel";
  root.appendChild(panel);

  const header = document.createElement("header");
  header.className = "header";
  panel.appendChild(header);

  const title = document.createElement("div");
  title.innerHTML = `<strong>简历自动填写预览</strong><span>${escapeHtml(location.hostname)}</span>`;
  header.appendChild(title);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "iconButton";
  closeButton.textContent = "×";
  closeButton.title = "关闭";
  closeButton.addEventListener("click", () => host.remove());
  header.appendChild(closeButton);

  const stats = document.createElement("div");
  stats.className = "stats";
  stats.appendChild(createStat("确定", plan.stats.confirmed));
  stats.appendChild(createStat("需确认", plan.stats.needsReview));
  stats.appendChild(createStat("未匹配", plan.stats.unmatched));
  stats.appendChild(createStat("动态添加", plan.stats.dynamicAdds));
  panel.appendChild(stats);

  if (completed) {
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.textContent = "填写已完成。插件不会自动提交表单，请你检查后手动保存或提交。";
    panel.appendChild(notice);
  }

  if (plan.ai?.enabled) {
    const aiNotice = document.createElement("div");
    aiNotice.className = plan.ai.error ? "notice warning" : "notice";
    if (plan.ai.error) {
      aiNotice.textContent = `AI 增强匹配未应用：${plan.ai.error}`;
    } else if (plan.ai.attempted) {
      aiNotice.textContent = `AI 增强匹配已应用 ${plan.ai.applied} 条建议，请确认后再填写。`;
    } else {
      aiNotice.textContent = "AI 增强匹配已启用，但当前没有需要 AI 兜底的字段。";
    }
    panel.appendChild(aiNotice);
  }

  if (plan.sectionAdds.length > 0) {
    const addList = document.createElement("div");
    addList.className = "sectionAdds";
    plan.sectionAdds.forEach((item) => {
      const row = document.createElement("div");
      row.textContent = `${item.label}: 将点击「${item.addButtonText || "添加"}」${item.addCount} 次`;
      addList.appendChild(row);
    });
    panel.appendChild(addList);
  }

  const list = document.createElement("div");
  list.className = "mappingList";
  panel.appendChild(list);

  const rows = plan.mappings.slice(0, 80).map((mapping) => {
    const row = createMappingRow(mapping, candidates);
    list.appendChild(row.element);
    return row;
  });

  const footer = document.createElement("footer");
  footer.className = "footer";
  panel.appendChild(footer);

  const rescanButton = document.createElement("button");
  rescanButton.type = "button";
  rescanButton.className = "secondary";
  rescanButton.textContent = "重新扫描";
  rescanButton.addEventListener("click", () => {
    void openPreviewPanel();
  });
  footer.appendChild(rescanButton);

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "primary";
  confirmButton.textContent = "确认并填写";
  confirmButton.disabled = plan.mappings.length === 0;
  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    confirmButton.textContent = "填写中...";
    const options = collectExecuteOptions(rows, candidates);
    await saveSelectedOverrides(options.overrides);
    const profile = await getResumeProfile();
    const result = await executeFillWithDynamicAdds(
      profile,
      location.origin,
      options.overrides,
      options.skipPaths
    );
    renderPanel(result.plan, scanPageFields(), true);
  });
  footer.appendChild(confirmButton);
}

function createMappingRow(
  mapping: FieldMapping,
  candidates: FieldCandidate[]
): {
  element: HTMLElement;
  mapping: FieldMapping;
  select: HTMLSelectElement;
} {
  const row = document.createElement("div");
  row.className = `mapping ${mapping.status}`;

  const resume = document.createElement("div");
  resume.className = "resumeField";
  const label = document.createElement("strong");
  label.textContent = mapping.resumeLabel;
  const value = document.createElement("span");
  value.textContent = mapping.targetValue;
  resume.appendChild(label);
  resume.appendChild(value);
  row.appendChild(resume);

  const select = document.createElement("select");
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "不填写";
  select.appendChild(emptyOption);

  candidates.forEach((candidate) => {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = candidateLabel(candidate);
    select.appendChild(option);
  });
  select.value = mapping.candidateId ?? "";
  row.appendChild(select);

  const confidence = document.createElement("div");
  confidence.className = "confidence";
  confidence.textContent =
    mapping.status === "unmatched" ? "未匹配" : `${Math.round(mapping.confidence)}%`;
  confidence.title = mapping.reason;
  row.appendChild(confidence);

  return { element: row, mapping, select };
}

function collectExecuteOptions(
  rows: Array<{ mapping: FieldMapping; select: HTMLSelectElement }>,
  candidates: FieldCandidate[]
): ExecuteFillOptions {
  const overrides: UserMappingOverride[] = [];
  const skipPaths: string[] = [];
  const now = new Date().toISOString();

  rows.forEach(({ mapping, select }) => {
    const candidate = candidates.find((item) => item.id === select.value);
    if (!candidate) {
      skipPaths.push(mapping.resumePath);
      return;
    }
    overrides.push({
      origin: location.origin,
      resumePath: mapping.resumePath,
      selector: candidate.selector,
      label: candidateLabel(candidate),
      updatedAt: now
    });
  });

  return { overrides, skipPaths };
}

async function saveSelectedOverrides(overrides: UserMappingOverride[]): Promise<void> {
  if (overrides.length === 0) {
    return;
  }
  await upsertMappingOverrides(overrides);
}

function createStat(label: string, value: number): HTMLElement {
  const item = document.createElement("div");
  item.className = "stat";
  const number = document.createElement("strong");
  number.textContent = String(value);
  const text = document.createElement("span");
  text.textContent = label;
  item.appendChild(number);
  item.appendChild(text);
  return item;
}

function candidateLabel(candidate: FieldCandidate): string {
  return (
    candidate.labelText ||
    candidate.placeholder ||
    candidate.name ||
    candidate.idAttr ||
    candidate.contextText.slice(0, 50) ||
    candidate.selector
  );
}

function createStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      color: #17202a;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
    }

    .panel {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      width: min(560px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #ffffff;
      border: 1px solid #c9d3df;
      border-radius: 8px;
      box-shadow: 0 18px 60px rgba(20, 32, 45, 0.24);
    }

    .header,
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid #e3e8ee;
      background: #f8fafc;
    }

    .footer {
      border-top: 1px solid #e3e8ee;
      border-bottom: 0;
    }

    .header strong {
      display: block;
      font-size: 15px;
      line-height: 1.3;
    }

    .header span {
      display: block;
      margin-top: 2px;
      color: #5d6b7a;
      font-size: 12px;
    }

    button,
    select {
      font: inherit;
    }

    .iconButton {
      width: 32px;
      height: 32px;
      border: 1px solid #cad4df;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid #e3e8ee;
    }

    .stat {
      padding: 8px;
      border: 1px solid #d8e0ea;
      border-radius: 6px;
      background: #fbfdff;
    }

    .stat strong,
    .stat span {
      display: block;
    }

    .stat strong {
      font-size: 18px;
    }

    .stat span {
      color: #627184;
      font-size: 12px;
    }

    .notice,
    .sectionAdds {
      margin: 12px 14px 0;
      padding: 10px;
      border-radius: 6px;
      background: #edf8f2;
      border: 1px solid #bee4cb;
      color: #1e5d36;
      line-height: 1.45;
    }

    .notice.warning {
      background: #fff8e8;
      border-color: #f0d8a7;
      color: #694700;
    }

    .sectionAdds {
      background: #fff8e8;
      border-color: #f0d8a7;
      color: #694700;
    }

    .mappingList {
      overflow: auto;
      padding: 12px 14px;
      display: grid;
      gap: 8px;
    }

    .mapping {
      display: grid;
      grid-template-columns: minmax(130px, 1fr) minmax(160px, 1.1fr) 64px;
      gap: 8px;
      align-items: center;
      padding: 8px;
      border: 1px solid #dce3eb;
      border-radius: 6px;
      background: #fff;
    }

    .mapping.needs-review {
      border-color: #f0d8a7;
    }

    .mapping.unmatched {
      border-color: #e2b5b5;
    }

    .resumeField {
      min-width: 0;
    }

    .resumeField strong,
    .resumeField span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .resumeField span {
      margin-top: 2px;
      color: #596979;
      font-size: 12px;
    }

    select {
      width: 100%;
      min-width: 0;
      border: 1px solid #c8d2df;
      border-radius: 6px;
      padding: 7px 8px;
      background: #fff;
    }

    .confidence {
      color: #526170;
      font-size: 12px;
      text-align: right;
    }

    .primary,
    .secondary {
      border: 1px solid #1d6f8f;
      border-radius: 6px;
      padding: 8px 12px;
      cursor: pointer;
    }

    .primary {
      background: #1d6f8f;
      color: #fff;
    }

    .primary:disabled {
      opacity: 0.65;
      cursor: progress;
    }

    .secondary {
      background: #fff;
      color: #1d6f8f;
    }

    @media (max-width: 560px) {
      .panel {
        left: 12px;
        right: 12px;
        top: 12px;
        width: auto;
      }

      .stats {
        grid-template-columns: repeat(2, 1fr);
      }

      .mapping {
        grid-template-columns: 1fr;
      }

      .confidence {
        text-align: left;
      }
    }
  `;
  return style;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
