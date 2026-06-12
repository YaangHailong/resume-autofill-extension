import {
  AiFieldSuggestion,
  AiMatchingRequestPayload,
  AiMatchingResponsePayload,
  AiMatchingSettings,
  AiPageFieldPayload,
  AiResumeFieldPayload,
  FieldCandidate,
  FieldMapping,
  FillPlan
} from "./types";
import {
  FIELD_SEMANTICS,
  inferSemanticsFromText,
  inferSemanticsFromValues
} from "./fieldDictionary";

const AI_MATCH_CONFIRMED_THRESHOLD = 68;
const AI_MATCH_MIN_CONFIDENCE = 50;
const MAX_AI_RESUME_FIELDS = 30;
const MAX_AI_PAGE_FIELDS = 120;
const MAX_AI_OPTIONS_PER_FIELD = 40;
const MAX_TEXT_LENGTH = 160;

export type AiFetch = (input: string, init: RequestInit) => Promise<Response>;

export async function enhanceFillPlanWithAi(
  plan: FillPlan,
  candidates: FieldCandidate[],
  settings: AiMatchingSettings,
  fetcher?: AiFetch
): Promise<FillPlan> {
  if (!settings.enabled) {
    return plan;
  }

  const endpoint = settings.endpoint.trim();
  if (!endpoint) {
    return withAiMeta(plan, {
      enabled: true,
      attempted: false,
      applied: 0,
      error: "AI 增强已启用，但没有配置后端接口地址。"
    });
  }

  const requestPayload = buildAiMatchingRequest(plan, candidates);
  if (requestPayload.resumeFields.length === 0) {
    return withAiMeta(plan, {
      enabled: true,
      attempted: false,
      applied: 0,
      endpoint
    });
  }

  const activeFetch = fetcher ?? globalThis.fetch?.bind(globalThis);
  if (!activeFetch) {
    return withAiMeta(plan, {
      enabled: true,
      attempted: false,
      applied: 0,
      endpoint,
      error: "当前环境不支持 fetch，无法请求 AI 后端。"
    });
  }

  try {
    const response = await activeFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      throw new Error(`AI 后端返回 ${response.status}`);
    }

    const aiResponse = (await response.json()) as AiMatchingResponsePayload;
    return applyAiSuggestions(plan, candidates, aiResponse, endpoint);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 增强匹配失败。";
    return withAiMeta(plan, {
      enabled: true,
      attempted: true,
      applied: 0,
      endpoint,
      error: message
    });
  }
}

export function buildAiMatchingRequest(
  plan: FillPlan,
  candidates: FieldCandidate[]
): AiMatchingRequestPayload {
  const resumeFields = plan.mappings
    .filter((mapping) => mapping.status !== "confirmed")
    .slice(0, MAX_AI_RESUME_FIELDS)
    .map(toAiResumeFieldPayload);

  return {
    origin: plan.origin,
    resumeFields,
    pageFields: candidates.slice(0, MAX_AI_PAGE_FIELDS).map(toAiPageFieldPayload)
  };
}

export function applyAiSuggestions(
  plan: FillPlan,
  candidates: FieldCandidate[],
  response: AiMatchingResponsePayload,
  endpoint?: string
): FillPlan {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const suggestions = Array.isArray(response.mappings) ? response.mappings : [];
  const usedCandidateIds = new Set(
    plan.mappings
      .map((mapping) => mapping.candidateId)
      .filter((id): id is string => Boolean(id))
  );
  let applied = 0;

  const suggestionsByPath = suggestions
    .filter(isValidSuggestion)
    .sort((a, b) => b.confidence - a.confidence)
    .reduce<Map<string, AiFieldSuggestion>>((items, suggestion) => {
      if (!items.has(suggestion.resumePath)) {
        items.set(suggestion.resumePath, suggestion);
      }
      return items;
    }, new Map());

  const mappings = plan.mappings.map((mapping) => {
    if (mapping.status === "confirmed") {
      return mapping;
    }

    const suggestion = suggestionsByPath.get(mapping.resumePath);
    if (!suggestion) {
      return mapping;
    }

    const candidate = candidatesById.get(suggestion.candidateId);
    if (!candidate) {
      return mapping;
    }

    if (mapping.candidateId) {
      usedCandidateIds.delete(mapping.candidateId);
    }

    if (usedCandidateIds.has(candidate.id)) {
      if (mapping.candidateId) {
        usedCandidateIds.add(mapping.candidateId);
      }
      return mapping;
    }

    usedCandidateIds.add(candidate.id);
    applied += 1;

    return createAiMapping(mapping, candidate, suggestion);
  });

  return withAiMeta(
    {
      ...plan,
      mappings,
      stats: recalculateStats({ ...plan, mappings })
    },
    {
      enabled: true,
      attempted: true,
      applied,
      endpoint
    }
  );
}

function toAiResumeFieldPayload(mapping: FieldMapping): AiResumeFieldPayload {
  return {
    path: mapping.resumePath,
    label: sanitizeText(mapping.resumeLabel),
    fieldKey: mapping.fieldKey,
    section: mapping.section,
    itemIndex: mapping.itemIndex,
    currentStatus: mapping.status,
    semanticHints: FIELD_SEMANTICS[mapping.fieldKey] ?? []
  };
}

function toAiPageFieldPayload(candidate: FieldCandidate): AiPageFieldPayload {
  const textForSemantics = [
    candidate.labelText,
    candidate.placeholder,
    candidate.name,
    candidate.idAttr,
    candidate.ariaLabel,
    candidate.contextText
  ].join(" ");

  return {
    id: candidate.id,
    labelText: sanitizeText(candidate.labelText),
    placeholder: sanitizeText(candidate.placeholder),
    kind: candidate.kind,
    inputType: sanitizeText(candidate.inputType, 40),
    name: sanitizeText(candidate.name, 80),
    idAttr: sanitizeText(candidate.idAttr, 80),
    ariaLabel: sanitizeText(candidate.ariaLabel),
    contextText: sanitizeText(candidate.contextText),
    options: candidate.options
      .slice(0, MAX_AI_OPTIONS_PER_FIELD)
      .map((option) => sanitizeText(option, 80))
      .filter(Boolean),
    sectionHint: candidate.sectionHint,
    semanticHints: Array.from(
      new Set([
        ...inferSemanticsFromText(textForSemantics),
        ...inferSemanticsFromValues(candidate.options)
      ])
    )
  };
}

function createAiMapping(
  mapping: FieldMapping,
  candidate: FieldCandidate,
  suggestion: AiFieldSuggestion
): FieldMapping {
  const confidence = clampConfidence(suggestion.confidence);

  return {
    ...mapping,
    candidateId: candidate.id,
    selector: candidate.selector,
    fieldLabel: candidateLabel(candidate),
    confidence,
    reason: `AI 建议：${sanitizeText(suggestion.reason, 180) || "语义相近。"}`,
    status: confidence >= AI_MATCH_CONFIRMED_THRESHOLD ? "confirmed" : "needs-review"
  };
}

function isValidSuggestion(suggestion: AiFieldSuggestion): boolean {
  return (
    typeof suggestion.resumePath === "string" &&
    typeof suggestion.candidateId === "string" &&
    Number.isFinite(suggestion.confidence) &&
    clampConfidence(suggestion.confidence) >= AI_MATCH_MIN_CONFIDENCE
  );
}

function recalculateStats(plan: FillPlan): FillPlan["stats"] {
  return {
    confirmed: plan.mappings.filter((mapping) => mapping.status === "confirmed").length,
    needsReview: plan.mappings.filter((mapping) => mapping.status === "needs-review").length,
    unmatched: plan.mappings.filter((mapping) => mapping.status === "unmatched").length,
    dynamicAdds: plan.sectionAdds.reduce((total, item) => total + item.addCount, 0)
  };
}

function withAiMeta(plan: FillPlan, ai: FillPlan["ai"]): FillPlan {
  return {
    ...plan,
    ai
  };
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

function clampConfidence(value: number): number {
  return Math.min(95, Math.max(0, Math.round(value)));
}

function sanitizeText(value: string, limit = MAX_TEXT_LENGTH): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}
