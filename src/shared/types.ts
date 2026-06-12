export type ResumeSectionName = "education" | "work" | "languages";

export interface ResumeSection<T> {
  id: string;
  title: string;
  items: T[];
}

export interface PersonalInfo {
  fullName: string;
  gender: string;
  birthDate: string;
  email: string;
  phone: string;
  workYears: string;
  photoNote: string;
}

export interface JobIntention {
  currentIndustry: string;
  currentOccupation: string;
  currentCity: string;
  currentMonthlySalary: string;
  expectedIndustry: string;
  expectedOccupation: string;
  expectedCity: string;
  expectedMonthlySalary: string;
  availability: string;
}

export interface EducationItem {
  id: string;
  schoolName: string;
  startDate: string;
  endDate: string;
  majorName: string;
  educationLevel: string;
  degree: string;
}

export interface WorkExperienceItem {
  id: string;
  unitName: string;
  positionName: string;
  startDate: string;
  endDate: string;
  responsibilities: string;
}

export interface LanguageAbilityItem {
  id: string;
  languageType: string;
  mastery: string;
  listeningSpeaking: string;
  readingWriting: string;
}

export interface ResumeProfile {
  version: 2;
  personalInfo: PersonalInfo;
  jobIntention: JobIntention;
  education: ResumeSection<EducationItem>;
  work: ResumeSection<WorkExperienceItem>;
  languages: ResumeSection<LanguageAbilityItem>;
  updatedAt: string;
}

export type FieldKind =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "radio"
  | "contenteditable"
  | "unknown";

export interface FieldCandidate {
  id: string;
  selector: string;
  tagName: string;
  kind: FieldKind;
  inputType: string;
  labelText: string;
  placeholder: string;
  name: string;
  idAttr: string;
  ariaLabel: string;
  contextText: string;
  value: string;
  options: string[];
  sectionHint?: ResumeSectionName;
}

export interface AddButtonCandidate {
  id: string;
  selector: string;
  text: string;
  contextText: string;
}

export interface ResumeFlatField {
  path: string;
  label: string;
  fieldKey: string;
  section?: ResumeSectionName;
  itemIndex?: number;
  value: string;
}

export type MappingStatus = "confirmed" | "needs-review" | "unmatched";

export interface FieldMapping {
  id: string;
  resumePath: string;
  resumeLabel: string;
  fieldKey: string;
  section?: ResumeSectionName;
  itemIndex?: number;
  targetValue: string;
  candidateId?: string;
  selector?: string;
  fieldLabel?: string;
  confidence: number;
  reason: string;
  status: MappingStatus;
}

export interface SectionAddPlan {
  id: string;
  section: ResumeSectionName;
  label: string;
  addButtonId: string;
  addButtonSelector: string;
  addButtonText: string;
  existingCount: number;
  desiredCount: number;
  addCount: number;
  reason: string;
}

export interface FillPlan {
  id: string;
  origin: string;
  createdAt: string;
  mappings: FieldMapping[];
  sectionAdds: SectionAddPlan[];
  ai?: {
    enabled: boolean;
    attempted: boolean;
    applied: number;
    endpoint?: string;
    error?: string;
  };
  stats: {
    confirmed: number;
    needsReview: number;
    unmatched: number;
    dynamicAdds: number;
  };
}

export interface UserMappingOverride {
  origin: string;
  resumePath: string;
  selector: string;
  label: string;
  updatedAt: string;
}

export interface ExecuteFillOptions {
  overrides: UserMappingOverride[];
  skipPaths: string[];
}

export interface AiMatchingSettings {
  enabled: boolean;
  endpoint: string;
}

export interface AiResumeFieldPayload {
  path: string;
  label: string;
  fieldKey: string;
  section?: ResumeSectionName;
  itemIndex?: number;
  currentStatus: MappingStatus;
  semanticHints: string[];
}

export interface AiPageFieldPayload {
  id: string;
  labelText: string;
  placeholder: string;
  kind: FieldKind;
  inputType: string;
  name: string;
  idAttr: string;
  ariaLabel: string;
  contextText: string;
  options: string[];
  sectionHint?: ResumeSectionName;
  semanticHints: string[];
}

export interface AiMatchingRequestPayload {
  origin: string;
  resumeFields: AiResumeFieldPayload[];
  pageFields: AiPageFieldPayload[];
}

export interface AiFieldSuggestion {
  resumePath: string;
  candidateId: string;
  confidence: number;
  reason: string;
}

export interface AiMatchingResponsePayload {
  mappings: AiFieldSuggestion[];
}
