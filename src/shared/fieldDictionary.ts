import { ResumeSectionName } from "./types";

export const FIELD_KEYWORDS: Record<string, string[]> = {
  fullName: ["姓名", "名字", "真实姓名", "name", "full name", "legal name"],
  preferredName: ["常用名", "英文名", "preferred name", "display name"],
  phone: ["手机", "手机号", "电话", "联系电话", "phone", "mobile", "telephone"],
  email: ["邮箱", "电子邮箱", "邮件", "email", "e-mail"],
  location: ["所在地", "城市", "地址", "现居地", "location", "city", "address"],
  website: ["个人网站", "主页", "website", "portfolio", "homepage"],
  github: ["github", "代码仓库", "repository"],
  linkedin: ["linkedin", "领英"],
  summary: ["个人简介", "自我评价", "个人总结", "summary", "profile", "bio", "about"],
  school: ["学校", "院校", "大学", "毕业院校", "school", "university", "college"],
  degree: ["学历", "学位", "degree", "education level", "qualification"],
  major: ["专业", "major", "field of study", "discipline"],
  startDate: ["开始时间", "开始日期", "入学时间", "起始", "start date", "from"],
  endDate: ["结束时间", "结束日期", "毕业时间", "截止", "end date", "to"],
  gpa: ["gpa", "绩点", "成绩"],
  company: ["公司", "单位", "雇主", "company", "employer", "organization"],
  title: ["职位", "岗位", "职务", "title", "position", "job title", "role"],
  description: ["描述", "说明", "职责", "经历描述", "description", "details", "responsibilities"],
  name: ["名称", "名字", "name", "title"],
  role: ["角色", "职责", "role", "responsibility"],
  technologies: ["技术", "技术栈", "工具", "technologies", "tech stack", "tools"],
  link: ["链接", "地址", "link", "url"],
  category: ["分类", "类别", "category"],
  values: ["技能", "能力", "skills", "expertise"],
  issuer: ["颁发机构", "发证机构", "issuer", "issuing organization"],
  date: ["日期", "时间", "获证时间", "date", "issued date"],
  credentialId: ["证书编号", "凭证编号", "credential", "credential id", "certificate id"],
  url: ["链接", "网址", "url", "link"],
  language: ["语言", "language"],
  proficiency: ["熟练程度", "水平", "proficiency", "level"],
  label: ["名称", "标签", "label", "name"]
};

export const SECTION_KEYWORDS: Record<ResumeSectionName, string[]> = {
  education: ["教育", "学历", "学校", "院校", "education", "school"],
  work: ["工作", "职业", "工作经历", "employment", "work", "experience"],
  internships: ["实习", "internship", "intern"],
  projects: ["项目", "项目经历", "project"],
  skills: ["技能", "能力", "skills"],
  certificates: ["证书", "认证", "资格证", "certificate", "certification", "license"],
  languages: ["语言", "language"],
  links: ["链接", "网站", "profile", "link", "website"]
};

export const SECTION_ADD_KEYWORDS: Record<ResumeSectionName, string[]> = {
  education: ["添加教育", "新增教育", "添加学历", "add education", "add school"],
  work: ["添加工作", "新增工作", "添加经历", "add work", "add experience"],
  internships: ["添加实习", "新增实习", "add internship"],
  projects: ["添加项目", "新增项目", "add project"],
  skills: ["添加技能", "新增技能", "add skill"],
  certificates: [
    "添加证书",
    "新增证书",
    "添加认证",
    "新增认证",
    "add certificate",
    "add certification",
    "add license"
  ],
  languages: ["添加语言", "新增语言", "add language"],
  links: ["添加链接", "新增链接", "add link", "add website"]
};

export const SECTION_LABELS: Record<ResumeSectionName, string> = {
  education: "教育经历",
  work: "工作经历",
  internships: "实习经历",
  projects: "项目经历",
  skills: "技能",
  certificates: "证书",
  languages: "语言",
  links: "个人链接"
};

export function sectionForText(text: string): ResumeSectionName | undefined {
  const normalized = normalizeText(text);
  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(normalizeText(keyword)))) {
      return section as ResumeSectionName;
    }
  }
  return undefined;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\-_:/\\|()[\]{}.,，。；;："'“”‘’]+/g, "")
    .trim();
}

