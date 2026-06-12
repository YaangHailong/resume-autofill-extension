import {
  EducationItem,
  JobIntention,
  LanguageAbilityItem,
  PersonalInfo,
  ResumeFlatField,
  ResumeProfile,
  ResumeSection,
  ResumeSectionName,
  WorkExperienceItem
} from "./types";

type LegacyRecord = Record<string, unknown>;

export function createId(prefix = "item"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export const emptyPersonalInfo: PersonalInfo = {
  fullName: "",
  gender: "",
  birthDate: "",
  email: "",
  phone: "",
  workYears: "",
  photoNote: ""
};

export const emptyJobIntention: JobIntention = {
  currentIndustry: "",
  currentOccupation: "",
  currentCity: "",
  currentMonthlySalary: "",
  expectedIndustry: "",
  expectedOccupation: "",
  expectedCity: "",
  expectedMonthlySalary: "",
  availability: ""
};

export function createEducationItem(): EducationItem {
  return {
    id: createId("edu"),
    schoolName: "",
    startDate: "",
    endDate: "",
    majorName: "",
    educationLevel: "",
    degree: ""
  };
}

export function createWorkExperienceItem(prefix = "work"): WorkExperienceItem {
  return {
    id: createId(prefix),
    unitName: "",
    positionName: "",
    startDate: "",
    endDate: "",
    responsibilities: ""
  };
}

export function createLanguageAbilityItem(): LanguageAbilityItem {
  return {
    id: createId("lang"),
    languageType: "",
    mastery: "",
    listeningSpeaking: "",
    readingWriting: ""
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
    version: 2,
    personalInfo: { ...emptyPersonalInfo },
    jobIntention: { ...emptyJobIntention },
    education: createSection("education", "教育经历", [createEducationItem()]),
    work: createSection("work", "工作经历", [createWorkExperienceItem("work")]),
    languages: createSection("languages", "语言能力", [createLanguageAbilityItem()]),
    updatedAt: new Date().toISOString()
  };
}

export function normalizeResumeProfile(input: Partial<ResumeProfile>): ResumeProfile {
  const fallback = createDefaultResumeProfile();
  const legacy = input as LegacyRecord;
  const legacyBasics = readRecord(legacy.basics);

  return {
    ...fallback,
    ...input,
    version: 2,
    personalInfo: {
      ...fallback.personalInfo,
      ...(input.personalInfo ?? {}),
      fullName: readString(input.personalInfo?.fullName, legacyBasics.fullName),
      email: readString(input.personalInfo?.email, legacyBasics.email),
      phone: readString(input.personalInfo?.phone, legacyBasics.phone)
    },
    jobIntention: { ...fallback.jobIntention, ...(input.jobIntention ?? {}) },
    education: normalizeSection(
      input.education as ResumeSection<Partial<EducationItem>> | undefined,
      fallback.education,
      normalizeEducationItem
    ),
    work: normalizeSection(
      input.work as ResumeSection<Partial<WorkExperienceItem>> | undefined,
      fallback.work,
      normalizeWorkExperienceItem
    ),
    languages: normalizeSection(
      input.languages as ResumeSection<Partial<LanguageAbilityItem>> | undefined,
      fallback.languages,
      normalizeLanguageAbilityItem
    ),
    updatedAt: input.updatedAt ?? fallback.updatedAt
  };
}

function normalizeSection<T>(
  input: ResumeSection<Partial<T>> | undefined,
  fallback: ResumeSection<T>,
  normalizeItem: (item: Partial<T> & LegacyRecord) => T
): ResumeSection<T> {
  if (!input || !Array.isArray(input.items)) {
    return fallback;
  }
  return {
    id: input.id || fallback.id,
    title: input.title || fallback.title,
    items: input.items.length > 0 ? input.items.map((item) => normalizeItem(item as Partial<T> & LegacyRecord)) : fallback.items
  };
}

function normalizeEducationItem(item: Partial<EducationItem> & LegacyRecord): EducationItem {
  return {
    id: readString(item.id, createId("edu")),
    schoolName: readString(item.schoolName, item.school),
    startDate: readString(item.startDate),
    endDate: readString(item.endDate),
    majorName: readString(item.majorName, item.major),
    educationLevel: readString(item.educationLevel),
    degree: readString(item.degree)
  };
}

function normalizeWorkExperienceItem(
  item: Partial<WorkExperienceItem> & LegacyRecord
): WorkExperienceItem {
  return {
    id: readString(item.id, createId("work")),
    unitName: readString(item.unitName, item.company),
    positionName: readString(item.positionName, item.title),
    startDate: readString(item.startDate),
    endDate: readString(item.endDate),
    responsibilities: readString(item.responsibilities, item.description)
  };
}

function normalizeLanguageAbilityItem(
  item: Partial<LanguageAbilityItem> & LegacyRecord
): LanguageAbilityItem {
  return {
    id: readString(item.id, createId("lang")),
    languageType: readString(item.languageType, item.language),
    mastery: readString(item.mastery, item.proficiency),
    listeningSpeaking: readString(item.listeningSpeaking),
    readingWriting: readString(item.readingWriting)
  };
}

export function isProfileEffectivelyEmpty(profile: ResumeProfile): boolean {
  return flattenResumeProfile(profile).length === 0;
}

export function flattenResumeProfile(profile: ResumeProfile): ResumeFlatField[] {
  const fields: ResumeFlatField[] = [];

  addTopField(fields, "personalInfo.fullName", "姓名", "fullName", profile.personalInfo.fullName);
  addTopField(fields, "personalInfo.gender", "性别", "gender", profile.personalInfo.gender);
  addTopField(
    fields,
    "personalInfo.birthDate",
    "出生日期",
    "birthDate",
    profile.personalInfo.birthDate
  );
  addTopField(fields, "personalInfo.email", "邮箱", "email", profile.personalInfo.email);
  addTopField(fields, "personalInfo.phone", "手机号", "phone", profile.personalInfo.phone);
  addTopField(
    fields,
    "personalInfo.workYears",
    "工作年限",
    "workYears",
    profile.personalInfo.workYears
  );

  addTopField(
    fields,
    "jobIntention.currentIndustry",
    "现从事行业",
    "currentIndustry",
    profile.jobIntention.currentIndustry
  );
  addTopField(
    fields,
    "jobIntention.currentOccupation",
    "现从事职业",
    "currentOccupation",
    profile.jobIntention.currentOccupation
  );
  addTopField(
    fields,
    "jobIntention.currentCity",
    "现工作城市",
    "currentCity",
    profile.jobIntention.currentCity
  );
  addTopField(
    fields,
    "jobIntention.currentMonthlySalary",
    "现月薪(税前)",
    "currentMonthlySalary",
    profile.jobIntention.currentMonthlySalary
  );
  addTopField(
    fields,
    "jobIntention.expectedIndustry",
    "期望从事行业",
    "expectedIndustry",
    profile.jobIntention.expectedIndustry
  );
  addTopField(
    fields,
    "jobIntention.expectedOccupation",
    "期望从事职业",
    "expectedOccupation",
    profile.jobIntention.expectedOccupation
  );
  addTopField(
    fields,
    "jobIntention.expectedCity",
    "期望工作城市",
    "expectedCity",
    profile.jobIntention.expectedCity
  );
  addTopField(
    fields,
    "jobIntention.expectedMonthlySalary",
    "期望月薪(税前)",
    "expectedMonthlySalary",
    profile.jobIntention.expectedMonthlySalary
  );
  addTopField(
    fields,
    "jobIntention.availability",
    "到岗时间",
    "availability",
    profile.jobIntention.availability
  );

  profile.education.items.forEach((item, index) => {
    addSectionField(fields, "education", index, "schoolName", "学校名称", item.schoolName);
    addSectionField(fields, "education", index, "startDate", "开始时间", item.startDate);
    addSectionField(fields, "education", index, "endDate", "结束时间", item.endDate);
    addSectionField(fields, "education", index, "majorName", "专业名称", item.majorName);
    addSectionField(fields, "education", index, "educationLevel", "学历", item.educationLevel);
    addSectionField(fields, "education", index, "degree", "学位", item.degree);
  });

  profile.work.items.forEach((item, index) => {
    addSectionField(fields, "work", index, "unitName", "单位名称", item.unitName);
    addSectionField(fields, "work", index, "positionName", "职位名称", item.positionName);
    addSectionField(fields, "work", index, "startDate", "开始时间", item.startDate);
    addSectionField(fields, "work", index, "endDate", "结束时间", item.endDate);
    addSectionField(fields, "work", index, "responsibilities", "工作职责", item.responsibilities);
  });

  profile.languages.items.forEach((item, index) => {
    addSectionField(fields, "languages", index, "languageType", "语言类型", item.languageType);
    addSectionField(fields, "languages", index, "mastery", "掌握程度", item.mastery);
    addSectionField(fields, "languages", index, "listeningSpeaking", "听说", item.listeningSpeaking);
    addSectionField(fields, "languages", index, "readingWriting", "读写", item.readingWriting);
  });

  return fields;
}

function addTopField(
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

function readRecord(value: unknown): LegacyRecord {
  return value && typeof value === "object" ? (value as LegacyRecord) : {};
}

function readString(...values: unknown[]): string {
  const value = values.find((item) => typeof item === "string" && item.length > 0);
  return typeof value === "string" ? value : "";
}
