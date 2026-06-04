export type ResumeSectionName =
  | "education"
  | "work"
  | "internships"
  | "projects"
  | "skills"
  | "certificates"
  | "languages"
  | "links";

export interface ResumeSection<T> {
  id: string;
  title: string;
  items: T[];
}

export interface BasicInfo {
  fullName: string;
  preferredName: string;
  phone: string;
  email: string;
  location: string;
  website: string;
  github: string;
  linkedin: string;
  summary: string;
}

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string;
  gpa: string;
  description: string;
}

export interface ExperienceItem {
  id: string;
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  role: string;
  technologies: string;
  startDate: string;
  endDate: string;
  link: string;
  description: string;
}

export interface SkillItem {
  id: string;
  category: string;
  values: string;
}

export interface CertificateItem {
  id: string;
  name: string;
  issuer: string;
  date: string;
  credentialId: string;
  url: string;
}

export interface LanguageItem {
  id: string;
  language: string;
  proficiency: string;
}

export interface LinkItem {
  id: string;
  label: string;
  url: string;
}

export interface ResumeProfile {
  version: 1;
  basics: BasicInfo;
  education: ResumeSection<EducationItem>;
  work: ResumeSection<ExperienceItem>;
  internships: ResumeSection<ExperienceItem>;
  projects: ResumeSection<ProjectItem>;
  skills: ResumeSection<SkillItem>;
  certificates: ResumeSection<CertificateItem>;
  languages: ResumeSection<LanguageItem>;
  links: ResumeSection<LinkItem>;
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

