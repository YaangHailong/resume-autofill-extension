import {
  AddButtonCandidate,
  FieldCandidate,
  FieldMapping,
  FillPlan,
  ResumeFlatField,
  ResumeProfile,
  ResumeSectionName,
  SectionAddPlan,
  UserMappingOverride
} from "./types";
import {
  FIELD_SEMANTICS,
  FIELD_KEYWORDS,
  FieldSemantic,
  SECTION_ADD_KEYWORDS,
  SECTION_KEYWORDS,
  SECTION_LABELS,
  inferSemanticsFromText,
  inferSemanticsFromValues,
  normalizeText
} from "./fieldDictionary";
import { flattenResumeProfile } from "./resume";

const CONFIRMED_THRESHOLD = 68;
const REVIEW_THRESHOLD = 42;
const MAX_DYNAMIC_ADDS_PER_SECTION = 5;

export function createFillPlan(
  profile: ResumeProfile,
  candidates: FieldCandidate[],
  addButtons: AddButtonCandidate[],
  origin: string,
  overrides: UserMappingOverride[] = []
): FillPlan {
  const fields = flattenResumeProfile(profile);
  const sectionAdds = createSectionAddPlans(profile, candidates, addButtons);
  const mappings = createFieldMappings(fields, candidates, origin, overrides);
  const confirmed = mappings.filter((mapping) => mapping.status === "confirmed").length;
  const needsReview = mappings.filter((mapping) => mapping.status === "needs-review").length;
  const unmatched = mappings.filter((mapping) => mapping.status === "unmatched").length;

  return {
    id: `plan-${Date.now()}`,
    origin,
    createdAt: new Date().toISOString(),
    mappings,
    sectionAdds,
    stats: {
      confirmed,
      needsReview,
      unmatched,
      dynamicAdds: sectionAdds.reduce((total, item) => total + item.addCount, 0)
    }
  };
}

export function createFieldMappings(
  fields: ResumeFlatField[],
  candidates: FieldCandidate[],
  origin: string,
  overrides: UserMappingOverride[] = []
): FieldMapping[] {
  const usedCandidateIds = new Set<string>();
  const assignedFieldIndexes = new Set<number>();
  const assignedMappings = new Map<number, FieldMapping>();
  const originOverrides = overrides.filter((override) => override.origin === origin);

  fields.forEach((field, index) => {
    const override = originOverrides.find((item) => item.resumePath === field.path);
    const overrideCandidate = override
      ? candidates.find((candidate) => candidate.selector === override.selector)
      : undefined;

    if (overrideCandidate && !usedCandidateIds.has(overrideCandidate.id)) {
      usedCandidateIds.add(overrideCandidate.id);
      assignedFieldIndexes.add(index);
      assignedMappings.set(
        index,
        createMapping(field, overrideCandidate, 100, "使用你为此网站保存的字段选择。", index)
      );
    }
  });

  const scored = fields
    .flatMap((field, fieldIndex) =>
      candidates
        .filter(
          (candidate) =>
            !assignedFieldIndexes.has(fieldIndex) && !usedCandidateIds.has(candidate.id)
        )
        .map((candidate) => ({
          field,
          fieldIndex,
          candidate,
          result: scoreFieldCandidate(field, candidate)
        }))
    )
    .filter((item) => item.result.score >= REVIEW_THRESHOLD)
    .sort((a, b) => b.result.score - a.result.score);

  scored.forEach((item) => {
    if (assignedFieldIndexes.has(item.fieldIndex) || usedCandidateIds.has(item.candidate.id)) {
      return;
    }

    assignedFieldIndexes.add(item.fieldIndex);
    usedCandidateIds.add(item.candidate.id);
    assignedMappings.set(
      item.fieldIndex,
      createMapping(
        item.field,
        item.candidate,
        item.result.score,
        item.result.reason,
        item.fieldIndex
      )
    );
  });

  return fields.map((field, index) => assignedMappings.get(index) ?? createUnmatchedMapping(field, index));
}

export function scoreFieldCandidate(
  field: ResumeFlatField,
  candidate: FieldCandidate
): { score: number; reason: string } {
  const keywords = keywordsForField(field);
  const labelText = buildLabelText(candidate);
  const metaText = `${candidate.name} ${candidate.idAttr} ${candidate.ariaLabel}`;
  const contextText = `${candidate.contextText} ${candidate.placeholder}`;
  const normalizedLabelText = normalizeText(labelText);
  const normalizedPlaceholder = normalizeText(candidate.placeholder);
  const normalizedMetaText = normalizeText(metaText);
  const normalizedContextText = normalizeText(contextText);
  let score = 0;
  const reasons: string[] = [];

  const sectionScore = scoreSection(field.section, candidate);
  if (sectionScore > 0) {
    score += sectionScore;
    reasons.push("区块语境匹配");
  }

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) {
      continue;
    }
    if (normalizedLabelText === normalizedKeyword) {
      score += 82;
      reasons.push(`标签精确匹配「${keyword}」`);
      break;
    }
    if (normalizedPlaceholder === normalizedKeyword) {
      score += 68;
      reasons.push(`占位提示精确匹配「${keyword}」`);
      break;
    }
    if (normalizedLabelText.includes(normalizedKeyword)) {
      score += 68;
      reasons.push(`标签包含「${keyword}」`);
      break;
    }
    if (normalizedPlaceholder.includes(normalizedKeyword)) {
      score += 52;
      reasons.push(`占位提示包含「${keyword}」`);
      break;
    }
    if (normalizedMetaText === normalizedKeyword) {
      score += 58;
      reasons.push(`字段属性精确匹配「${keyword}」`);
      break;
    }
    if (normalizedMetaText.includes(normalizedKeyword)) {
      score += 34;
      reasons.push(`字段属性包含「${keyword}」`);
      break;
    }
    if (normalizedContextText.includes(normalizedKeyword)) {
      score += 18;
      reasons.push(`邻近文本包含「${keyword}」`);
      break;
    }
  }

  score += typeScore(field, candidate);
  score += valueShapeScore(field, candidate);
  score += optionScore(field, candidate);
  const semantic = semanticScore(field, candidate);
  score += semantic.score;
  reasons.push(...semantic.reasons);

  if (candidate.kind === "checkbox" || candidate.kind === "radio") {
    score -= 8;
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    reason: reasons.length > 0 ? reasons.join("，") : "字段名称相似。"
  };
}

export function createSectionAddPlans(
  profile: ResumeProfile,
  candidates: FieldCandidate[],
  addButtons: AddButtonCandidate[]
): SectionAddPlan[] {
  const sections: ResumeSectionName[] = ["education", "work", "languages"];

  return sections
    .map((section) => {
      const sectionItems = profile[section].items as unknown as Array<Record<string, unknown>>;
      const desiredCount = sectionItems.filter((item) =>
        Object.entries(item).some(
          ([key, value]) =>
            key !== "id" && typeof value === "string" && value.trim().length > 0
        )
      ).length;

      if (desiredCount < 1) {
        return undefined;
      }

      const addButton = findAddButton(section, addButtons);
      if (!addButton) {
        return undefined;
      }

      const existingCount = estimateExistingSectionCount(section, candidates);
      const addCount = Math.min(
        Math.max(0, desiredCount - existingCount),
        MAX_DYNAMIC_ADDS_PER_SECTION
      );

      if (addCount < 1) {
        return undefined;
      }

      return {
        id: `add-${section}`,
        section,
        label: SECTION_LABELS[section],
        addButtonId: addButton.id,
        addButtonSelector: addButton.selector,
        addButtonText: addButton.text,
        existingCount,
        desiredCount,
        addCount,
        reason: `简历中有 ${desiredCount} 条${SECTION_LABELS[section]}，页面当前约有 ${existingCount} 条。`
      };
    })
    .filter((item): item is SectionAddPlan => Boolean(item));
}

function createMapping(
  field: ResumeFlatField,
  candidate: FieldCandidate,
  confidence: number,
  reason: string,
  index: number
): FieldMapping {
  return {
    id: `mapping-${index}`,
    resumePath: field.path,
    resumeLabel: field.itemIndex === undefined ? field.label : `${field.label} #${field.itemIndex + 1}`,
    fieldKey: field.fieldKey,
    section: field.section,
    itemIndex: field.itemIndex,
    targetValue: field.value,
    candidateId: candidate.id,
    selector: candidate.selector,
    fieldLabel: buildLabelText(candidate) || candidate.placeholder || candidate.name || candidate.idAttr,
    confidence,
    reason,
    status: confidence >= CONFIRMED_THRESHOLD ? "confirmed" : "needs-review"
  };
}

function createUnmatchedMapping(field: ResumeFlatField, index: number): FieldMapping {
  return {
    id: `mapping-${index}`,
    resumePath: field.path,
    resumeLabel: field.itemIndex === undefined ? field.label : `${field.label} #${field.itemIndex + 1}`,
    fieldKey: field.fieldKey,
    section: field.section,
    itemIndex: field.itemIndex,
    targetValue: field.value,
    confidence: 0,
    reason: "没有找到足够相似的网页字段。",
    status: "unmatched"
  };
}

function keywordsForField(field: ResumeFlatField): string[] {
  const keywords = FIELD_KEYWORDS[field.fieldKey] ?? [];
  const sectionKeywords = field.section ? SECTION_KEYWORDS[field.section] : [];
  return [...keywords, field.label, ...sectionKeywords.slice(0, 2)];
}

function buildLabelText(candidate: FieldCandidate): string {
  return [candidate.labelText, candidate.ariaLabel].filter(Boolean).join(" ");
}

function scoreSection(section: ResumeSectionName | undefined, candidate: FieldCandidate): number {
  if (!section) {
    return 0;
  }
  if (candidate.sectionHint === section) {
    return 18;
  }
  const sectionText = `${candidate.contextText} ${candidate.labelText}`;
  const normalized = normalizeText(sectionText);
  return SECTION_KEYWORDS[section].some((keyword) => normalized.includes(normalizeText(keyword)))
    ? 12
    : 0;
}

function typeScore(field: ResumeFlatField, candidate: FieldCandidate): number {
  if (field.fieldKey === "email" && candidate.kind === "email") {
    return 28;
  }
  if (field.fieldKey === "phone" && candidate.kind === "tel") {
    return 24;
  }
  if (["birthDate", "startDate", "endDate", "availability"].includes(field.fieldKey)) {
    return candidate.kind === "date" ? 18 : 0;
  }
  if (field.fieldKey === "responsibilities") {
    return candidate.kind === "textarea" || candidate.kind === "contenteditable" ? 14 : 0;
  }
  return 0;
}

function semanticScore(
  field: ResumeFlatField,
  candidate: FieldCandidate
): { score: number; reasons: string[] } {
  const fieldSemantics = FIELD_SEMANTICS[field.fieldKey] ?? [];
  if (fieldSemantics.length === 0) {
    return { score: 0, reasons: [] };
  }

  const labelSemantics = inferSemanticsFromText(
    `${buildLabelText(candidate)} ${candidate.placeholder} ${candidate.name} ${candidate.idAttr}`
  );
  const optionSemantics = inferSemanticsFromValues(candidate.options);
  const valueSemantics = inferSemanticsFromValues([candidate.value]);
  const candidateSemantics = uniqueSemantics([
    ...labelSemantics,
    ...optionSemantics,
    ...valueSemantics
  ]);

  if (candidateSemantics.length === 0) {
    return { score: 0, reasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];
  const directMatches = intersectSemantics(fieldSemantics, candidateSemantics);
  const specificMatches = directMatches.filter((item) => item !== "education_credential");

  if (specificMatches.length > 0) {
    score += 34;
    reasons.push("字段语义匹配");
  } else if (directMatches.includes("education_credential")) {
    score += 22;
    reasons.push("教育资质语义相近");
  }

  const optionMatches = intersectSemantics(fieldSemantics, optionSemantics);
  if (optionMatches.some((item) => item !== "education_credential")) {
    score += 22;
    reasons.push("下拉选项语义匹配");
  }

  score += educationCredentialConflictScore(field, optionSemantics, reasons);

  return { score, reasons };
}

function educationCredentialConflictScore(
  field: ResumeFlatField,
  optionSemantics: FieldSemantic[],
  reasons: string[]
): number {
  if (optionSemantics.length === 0) {
    return 0;
  }

  if (
    field.fieldKey === "educationLevel" &&
    optionSemantics.includes("academic_degree") &&
    !optionSemantics.includes("education_level")
  ) {
    reasons.push("下拉选项更像学位而不是学历");
    return -60;
  }

  if (
    field.fieldKey === "degree" &&
    optionSemantics.includes("education_level") &&
    !optionSemantics.includes("academic_degree")
  ) {
    reasons.push("下拉选项更像学历而不是学位");
    return -60;
  }

  return 0;
}

function valueShapeScore(field: ResumeFlatField, candidate: FieldCandidate): number {
  const targetValue = field.value.trim();
  const candidateText = `${candidate.value} ${candidate.placeholder} ${candidate.name} ${candidate.idAttr}`;
  if (field.fieldKey === "phone") {
    const targetDigits = targetValue.replace(/\D/g, "");
    const candidateDigits = candidate.value.replace(/\D/g, "");
    let score = 0;
    if (targetDigits.length >= 7 && candidateDigits.length >= 7) {
      score += 24;
    }
    if (/手机|手机号|11位|phone|mobile/i.test(candidateText)) {
      score += 18;
    }
    if (/中国大陆|区号|国家|country|region/i.test(candidateText)) {
      score -= 28;
    }
    return score;
  }

  if (field.fieldKey === "email") {
    return /@/.test(candidate.value) || /email|mail|邮箱/i.test(candidateText) ? 16 : 0;
  }

  return 0;
}

function optionScore(field: ResumeFlatField, candidate: FieldCandidate): number {
  if (candidate.kind !== "select" || candidate.options.length === 0) {
    return 0;
  }
  const target = normalizeText(field.value);
  if (!target) {
    return 0;
  }
  return candidate.options.some((option) => {
    const normalizedOption = normalizeText(option);
    return normalizedOption.includes(target) || target.includes(normalizedOption);
  })
    ? 18
    : 0;
}

function uniqueSemantics(semantics: FieldSemantic[]): FieldSemantic[] {
  return Array.from(new Set(semantics));
}

function intersectSemantics(
  left: FieldSemantic[],
  right: FieldSemantic[]
): FieldSemantic[] {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

function findAddButton(
  section: ResumeSectionName,
  addButtons: AddButtonCandidate[]
): AddButtonCandidate | undefined {
  const keywords = SECTION_ADD_KEYWORDS[section].map(normalizeText);
  const looseKeywords = SECTION_KEYWORDS[section].map(normalizeText);

  return addButtons
    .map((button) => {
      const ownText = normalizeText(button.text);
      const contextText = normalizeText(button.contextText);
      const strongHit = keywords.some((keyword) => ownText.includes(keyword));
      const looseHit =
        ownText.includes(normalizeText("添加")) ||
        ownText.includes(normalizeText("新增")) ||
        ownText.includes("add");
      const ownSectionHit = looseKeywords.some((keyword) => ownText.includes(keyword));
      const nearbySectionHit =
        contextText.length < 300 &&
        looseKeywords.some((keyword) => contextText.includes(keyword));
      return {
        button,
        score: strongHit ? 100 : looseHit && ownSectionHit ? 80 : looseHit && nearbySectionHit ? 55 : 0
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.button;
}

function estimateExistingSectionCount(
  section: ResumeSectionName,
  candidates: FieldCandidate[]
): number {
  const sectionCandidates = candidates.filter((candidate) => candidate.sectionHint === section);
  if (sectionCandidates.length === 0) {
    const keywords = SECTION_KEYWORDS[section].map(normalizeText);
    const hasContext = candidates.some((candidate) => {
      const text = normalizeText(`${candidate.contextText} ${candidate.labelText} ${candidate.placeholder}`);
      return keywords.some((keyword) => text.includes(keyword));
    });
    return hasContext ? 1 : 0;
  }
  return 1;
}
