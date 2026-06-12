import { ResumeSectionName } from "./types";

export type FieldSemantic =
  | "person_name"
  | "gender"
  | "date"
  | "email"
  | "phone"
  | "city"
  | "salary"
  | "industry"
  | "occupation"
  | "school"
  | "major"
  | "education_credential"
  | "education_level"
  | "academic_degree"
  | "organization"
  | "position"
  | "responsibility"
  | "language"
  | "language_proficiency";

export const FIELD_KEYWORDS: Record<string, string[]> = {
  fullName: ["姓名", "名字", "真实姓名", "name", "full name", "legal name"],
  gender: ["性别", "gender", "sex"],
  birthDate: ["出生日期", "生日", "出生年月", "birth date", "birthday", "date of birth"],
  email: ["邮箱", "电子邮箱", "邮件", "email", "e-mail"],
  phone: ["手机号", "手机", "电话", "联系电话", "phone", "mobile", "telephone"],
  workYears: ["工作年限", "工作经验", "工作时长", "years of experience", "work years"],
  currentIndustry: ["现从事行业", "当前行业", "目前行业", "current industry"],
  currentOccupation: ["现从事职业", "当前职业", "目前职业", "current occupation", "current role"],
  currentCity: ["现工作城市", "当前城市", "目前城市", "current city", "work city"],
  currentMonthlySalary: [
    "现月薪",
    "现月薪(税前)",
    "当前月薪",
    "目前月薪",
    "current salary",
    "current monthly salary"
  ],
  expectedIndustry: ["期望从事行业", "期望行业", "目标行业", "expected industry"],
  expectedOccupation: ["期望从事职业", "期望职业", "目标职业", "expected occupation"],
  expectedCity: ["期望工作城市", "期望城市", "目标城市", "expected city"],
  expectedMonthlySalary: [
    "期望月薪",
    "期望月薪(税前)",
    "期望薪资",
    "expected salary",
    "expected monthly salary"
  ],
  availability: ["到岗时间", "入职时间", "可到岗时间", "available date", "availability"],
  schoolName: ["学校名称", "学校", "院校", "毕业院校", "school", "university", "college"],
  startDate: ["开始时间", "开始日期", "入学时间", "起始", "start date", "from"],
  endDate: ["结束时间", "结束日期", "毕业时间", "截止", "end date", "to"],
  majorName: ["专业名称", "专业", "major", "field of study", "discipline"],
  educationLevel: ["学历", "最高学历", "education level", "qualification"],
  degree: ["学位", "degree"],
  unitName: ["单位名称", "公司名称", "公司", "单位", "雇主", "company", "employer"],
  positionName: ["职位名称", "职位", "岗位", "职务", "position", "job title", "title"],
  responsibilities: ["工作职责", "职责", "工作内容", "经历描述", "responsibilities", "description"],
  languageType: ["语言类型", "语言", "language type", "language"],
  mastery: ["掌握程度", "熟练程度", "熟练水平", "proficiency", "mastery", "level"],
  listeningSpeaking: ["听说", "听力口语", "听说能力", "listening speaking"],
  readingWriting: ["读写", "阅读写作", "读写能力", "reading writing"]
};

export const FIELD_SEMANTICS: Record<string, FieldSemantic[]> = {
  fullName: ["person_name"],
  gender: ["gender"],
  birthDate: ["date"],
  email: ["email"],
  phone: ["phone"],
  currentIndustry: ["industry"],
  currentOccupation: ["occupation"],
  currentCity: ["city"],
  currentMonthlySalary: ["salary"],
  expectedIndustry: ["industry"],
  expectedOccupation: ["occupation"],
  expectedCity: ["city"],
  expectedMonthlySalary: ["salary"],
  availability: ["date"],
  schoolName: ["school"],
  startDate: ["date"],
  endDate: ["date"],
  majorName: ["major"],
  educationLevel: ["education_level", "education_credential"],
  degree: ["academic_degree", "education_credential"],
  unitName: ["organization"],
  positionName: ["position"],
  responsibilities: ["responsibility"],
  languageType: ["language"],
  mastery: ["language_proficiency"],
  listeningSpeaking: ["language_proficiency"],
  readingWriting: ["language_proficiency"]
};

export const SEMANTIC_KEYWORDS: Record<FieldSemantic, string[]> = {
  person_name: ["姓名", "名字", "真实姓名", "name", "full name"],
  gender: ["性别", "gender", "sex"],
  date: ["日期", "时间", "年月", "出生", "开始", "结束", "毕业", "入学", "到岗", "date", "time"],
  email: ["邮箱", "电子邮箱", "email", "mail"],
  phone: ["手机", "电话", "手机号", "phone", "mobile"],
  city: ["城市", "地点", "所在地", "工作地", "city", "location"],
  salary: ["薪资", "月薪", "工资", "salary", "compensation"],
  industry: ["行业", "industry"],
  occupation: ["职业", "岗位", "职位类别", "occupation", "profession"],
  school: ["学校", "院校", "大学", "高校", "school", "university", "college"],
  major: ["专业", "研究方向", "研究领域", "方向", "major", "field of study"],
  education_credential: ["学历", "学位", "教育程度", "教育背景", "education", "qualification", "degree"],
  education_level: ["学历", "最高学历", "教育程度", "education level", "qualification"],
  academic_degree: ["学位", "授予学位", "degree"],
  organization: ["单位", "公司", "机构", "组织", "company", "employer", "organization"],
  position: ["职位", "岗位", "职务", "title", "position", "job title"],
  responsibility: ["职责", "工作内容", "描述", "responsibility", "description"],
  language: ["语言", "语种", "language"],
  language_proficiency: ["掌握", "熟练", "听说", "读写", "水平", "proficiency", "level"]
};

export const SEMANTIC_VALUE_KEYWORDS: Record<FieldSemantic, string[]> = {
  person_name: [],
  gender: ["男", "女", "male", "female"],
  date: [],
  email: ["@"],
  phone: [],
  city: [],
  salary: [],
  industry: [],
  occupation: [],
  school: [],
  major: [],
  education_credential: [
    "大专",
    "专科",
    "本科",
    "硕士",
    "硕士研究生",
    "博士",
    "博士研究生",
    "学士",
    "无学位",
    "bachelor",
    "master",
    "doctor"
  ],
  education_level: [
    "高中",
    "中专",
    "大专",
    "专科",
    "本科",
    "研究生",
    "硕士研究生",
    "博士研究生",
    "education level"
  ],
  academic_degree: ["学士", "硕士", "博士", "无学位", "bachelor", "master", "doctor", "phd"],
  organization: [],
  position: [],
  responsibility: [],
  language: ["英语", "日语", "法语", "德语", "中文", "普通话", "english", "japanese"],
  language_proficiency: ["一般", "良好", "熟练", "精通", "cet", "雅思", "托福"]
};

export const SECTION_KEYWORDS: Record<ResumeSectionName, string[]> = {
  education: ["教育经历", "教育", "学历", "学校", "院校", "education", "school"],
  work: ["工作经历", "工作", "职业经历", "employment", "work", "experience"],
  languages: ["语言能力", "语言", "language"]
};

export const SECTION_ADD_KEYWORDS: Record<ResumeSectionName, string[]> = {
  education: ["添加教育经历", "添加教育", "新增教育", "添加学历", "add education", "add school"],
  work: ["添加工作经历", "添加工作", "新增工作", "添加经历", "add work", "add experience"],
  languages: ["添加语言能力", "添加语言", "新增语言", "add language"]
};

export const SECTION_LABELS: Record<ResumeSectionName, string> = {
  education: "教育经历",
  work: "工作经历",
  languages: "语言能力"
};

export function sectionForText(text: unknown): ResumeSectionName | undefined {
  const normalized = normalizeText(text);
  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(normalizeText(keyword)))) {
      return section as ResumeSectionName;
    }
  }
  return undefined;
}

export function inferSemanticsFromText(text: unknown): FieldSemantic[] {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  return Object.entries(SEMANTIC_KEYWORDS)
    .filter(([, keywords]) =>
      keywords.some((keyword) => normalized.includes(normalizeText(keyword)))
    )
    .map(([semantic]) => semantic as FieldSemantic);
}

export function inferSemanticsFromValues(values: unknown[]): FieldSemantic[] {
  const normalizedValues = values.map(normalizeText).filter(Boolean);
  if (normalizedValues.length === 0) {
    return [];
  }

  return Object.entries(SEMANTIC_VALUE_KEYWORDS)
    .filter(([semantic, keywords]) => {
      if (keywords.length === 0) {
        return false;
      }
      return normalizedValues.some((value) =>
        keywords.some((keyword) => valueMatchesSemantic(semantic as FieldSemantic, value, keyword))
      );
    })
    .map(([semantic]) => semantic as FieldSemantic);
}

function valueMatchesSemantic(
  semantic: FieldSemantic,
  normalizedValue: string,
  keyword: string
): boolean {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  if (semantic === "academic_degree") {
    if (/研究生|本科|专科|大专|高中|中专/.test(normalizedValue)) {
      return false;
    }
    return (
      normalizedValue === normalizedKeyword ||
      normalizedValue.includes(`${normalizedKeyword}学位`) ||
      normalizedValue.includes("学位") ||
      /bachelor|master|doctor|phd/.test(normalizedValue)
    );
  }

  return normalizedValue.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedValue);
}

export function normalizeText(text: unknown): string {
  if (text === null || text === undefined) {
    return "";
  }
  return String(text)
    .toLowerCase()
    .replace(/[\s\-_:/\\|()[\]{}.,，。；;："'“”‘’]+/g, "")
    .trim();
}
