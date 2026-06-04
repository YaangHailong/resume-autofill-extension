import {
  BasicInfo,
  CertificateItem,
  EducationItem,
  ExperienceItem,
  LanguageItem,
  LinkItem,
  ProjectItem,
  ResumeFlatField,
  ResumeProfile,
  ResumeSection,
  ResumeSectionName,
  SkillItem
} from "./types";

export function createId(prefix = "item"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export const emptyBasics: BasicInfo = {
  fullName: "",
  preferredName: "",
  phone: "",
  email: "",
  location: "",
  website: "",
  github: "",
  linkedin: "",
  summary: ""
};

export function createEducationItem(): EducationItem {
  return {
    id: createId("edu"),
    school: "",
    degree: "",
    major: "",
    startDate: "",
    endDate: "",
    gpa: "",
    description: ""
  };
}

export function createExperienceItem(prefix = "exp"): ExperienceItem {
  return {
    id: createId(prefix),
    company: "",
    title: "",
    location: "",
    startDate: "",
    endDate: "",
    description: ""
  };
}

export function createProjectItem(): ProjectItem {
  return {
    id: createId("project"),
    name: "",
    role: "",
    technologies: "",
    startDate: "",
    endDate: "",
    link: "",
    description: ""
  };
}

export function createSkillItem(): SkillItem {
  return {
    id: createId("skill"),
    category: "",
    values: ""
  };
}

export function createCertificateItem(): CertificateItem {
  return {
    id: createId("cert"),
    name: "",
    issuer: "",
    date: "",
    credentialId: "",
    url: ""
  };
}

export function createLanguageItem(): LanguageItem {
  return {
    id: createId("lang"),
    language: "",
    proficiency: ""
  };
}

export function createLinkItem(): LinkItem {
  return {
    id: createId("link"),
    label: "",
    url: ""
  };
}

function createSection<T>(
  id: ResumeSectionName,
  title: string,
  items: T[]
): ResumeSection<T> {
  return { id, title, items };
}

export function createDefaultResumeProfile(): ResumeProfile {
  return {
    version: 1,
    basics: { ...emptyBasics },
    education: createSection("education", "教育经历", [createEducationItem()]),
    work: createSection("work", "工作经历", [createExperienceItem("work")]),
    internships: createSection("internships", "实习经历", [
      createExperienceItem("intern")
    ]),
    projects: createSection("projects", "项目经历", [createProjectItem()]),
    skills: createSection("skills", "技能", [createSkillItem()]),
    certificates: createSection("certificates", "证书", [
      createCertificateItem()
    ]),
    languages: createSection("languages", "语言", [createLanguageItem()]),
    links: createSection("links", "个人链接", [createLinkItem()]),
    updatedAt: new Date().toISOString()
  };
}

export function normalizeResumeProfile(input: Partial<ResumeProfile>): ResumeProfile {
  const fallback = createDefaultResumeProfile();
  return {
    ...fallback,
    ...input,
    version: 1,
    basics: { ...fallback.basics, ...(input.basics ?? {}) },
    education: normalizeSection(input.education, fallback.education),
    work: normalizeSection(input.work, fallback.work),
    internships: normalizeSection(input.internships, fallback.internships),
    projects: normalizeSection(input.projects, fallback.projects),
    skills: normalizeSection(input.skills, fallback.skills),
    certificates: normalizeSection(input.certificates, fallback.certificates),
    languages: normalizeSection(input.languages, fallback.languages),
    links: normalizeSection(input.links, fallback.links),
    updatedAt: input.updatedAt ?? fallback.updatedAt
  };
}

function normalizeSection<T>(
  input: ResumeSection<T> | undefined,
  fallback: ResumeSection<T>
): ResumeSection<T> {
  if (!input || !Array.isArray(input.items)) {
    return fallback;
  }
  return {
    id: input.id || fallback.id,
    title: input.title || fallback.title,
    items: input.items.length > 0 ? input.items : fallback.items
  };
}

export function isProfileEffectivelyEmpty(profile: ResumeProfile): boolean {
  return flattenResumeProfile(profile).length === 0;
}

export function flattenResumeProfile(profile: ResumeProfile): ResumeFlatField[] {
  const fields: ResumeFlatField[] = [];

  addBasic(fields, "basics.fullName", "姓名", "fullName", profile.basics.fullName);
  addBasic(
    fields,
    "basics.preferredName",
    "常用名",
    "preferredName",
    profile.basics.preferredName
  );
  addBasic(fields, "basics.phone", "手机号", "phone", profile.basics.phone);
  addBasic(fields, "basics.email", "邮箱", "email", profile.basics.email);
  addBasic(fields, "basics.location", "所在地", "location", profile.basics.location);
  addBasic(fields, "basics.website", "个人网站", "website", profile.basics.website);
  addBasic(fields, "basics.github", "GitHub", "github", profile.basics.github);
  addBasic(fields, "basics.linkedin", "LinkedIn", "linkedin", profile.basics.linkedin);
  addBasic(fields, "basics.summary", "个人简介", "summary", profile.basics.summary);

  profile.education.items.forEach((item, index) => {
    addSectionField(fields, "education", index, "school", "学校", item.school);
    addSectionField(fields, "education", index, "degree", "学历/学位", item.degree);
    addSectionField(fields, "education", index, "major", "专业", item.major);
    addSectionField(fields, "education", index, "startDate", "教育开始时间", item.startDate);
    addSectionField(fields, "education", index, "endDate", "教育结束时间", item.endDate);
    addSectionField(fields, "education", index, "gpa", "GPA", item.gpa);
    addSectionField(fields, "education", index, "description", "教育描述", item.description);
  });

  profile.work.items.forEach((item, index) => {
    addExperienceFields(fields, "work", index, item, "工作");
  });

  profile.internships.items.forEach((item, index) => {
    addExperienceFields(fields, "internships", index, item, "实习");
  });

  profile.projects.items.forEach((item, index) => {
    addSectionField(fields, "projects", index, "name", "项目名称", item.name);
    addSectionField(fields, "projects", index, "role", "项目角色", item.role);
    addSectionField(fields, "projects", index, "technologies", "项目技术", item.technologies);
    addSectionField(fields, "projects", index, "startDate", "项目开始时间", item.startDate);
    addSectionField(fields, "projects", index, "endDate", "项目结束时间", item.endDate);
    addSectionField(fields, "projects", index, "link", "项目链接", item.link);
    addSectionField(fields, "projects", index, "description", "项目描述", item.description);
  });

  profile.skills.items.forEach((item, index) => {
    addSectionField(fields, "skills", index, "category", "技能分类", item.category);
    addSectionField(fields, "skills", index, "values", "技能", item.values);
  });

  profile.certificates.items.forEach((item, index) => {
    addSectionField(fields, "certificates", index, "name", "证书名称", item.name);
    addSectionField(fields, "certificates", index, "issuer", "颁发机构", item.issuer);
    addSectionField(fields, "certificates", index, "date", "获证时间", item.date);
    addSectionField(fields, "certificates", index, "credentialId", "证书编号", item.credentialId);
    addSectionField(fields, "certificates", index, "url", "证书链接", item.url);
  });

  profile.languages.items.forEach((item, index) => {
    addSectionField(fields, "languages", index, "language", "语言", item.language);
    addSectionField(fields, "languages", index, "proficiency", "熟练程度", item.proficiency);
  });

  profile.links.items.forEach((item, index) => {
    addSectionField(fields, "links", index, "label", "链接名称", item.label);
    addSectionField(fields, "links", index, "url", "链接地址", item.url);
  });

  return fields;
}

function addBasic(
  fields: ResumeFlatField[],
  path: string,
  label: string,
  fieldKey: string,
  value: string
): void {
  const cleanValue = value.trim();
  if (!cleanValue) {
    return;
  }
  fields.push({ path, label, fieldKey, value: cleanValue });
}

function addSectionField(
  fields: ResumeFlatField[],
  section: ResumeSectionName,
  itemIndex: number,
  fieldKey: string,
  label: string,
  value: string
): void {
  const cleanValue = value.trim();
  if (!cleanValue) {
    return;
  }
  fields.push({
    path: `${section}.items[${itemIndex}].${fieldKey}`,
    label,
    fieldKey,
    section,
    itemIndex,
    value: cleanValue
  });
}

function addExperienceFields(
  fields: ResumeFlatField[],
  section: "work" | "internships",
  itemIndex: number,
  item: ExperienceItem,
  prefix: string
): void {
  addSectionField(fields, section, itemIndex, "company", `${prefix}公司`, item.company);
  addSectionField(fields, section, itemIndex, "title", `${prefix}职位`, item.title);
  addSectionField(fields, section, itemIndex, "location", `${prefix}地点`, item.location);
  addSectionField(fields, section, itemIndex, "startDate", `${prefix}开始时间`, item.startDate);
  addSectionField(fields, section, itemIndex, "endDate", `${prefix}结束时间`, item.endDate);
  addSectionField(fields, section, itemIndex, "description", `${prefix}描述`, item.description);
}

