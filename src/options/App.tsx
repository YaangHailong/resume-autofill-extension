import { useEffect, useMemo, useState } from "react";
import {
  createCertificateItem,
  createDefaultResumeProfile,
  createEducationItem,
  createExperienceItem,
  createLanguageItem,
  createLinkItem,
  createProjectItem,
  createSkillItem,
  flattenResumeProfile,
  normalizeResumeProfile
} from "../shared/resume";
import { getResumeProfile, saveResumeProfile } from "../shared/storage";
import {
  CertificateItem,
  EducationItem,
  ExperienceItem,
  LanguageItem,
  LinkItem,
  ProjectItem,
  ResumeProfile,
  ResumeSectionName,
  SkillItem
} from "../shared/types";

type SectionItemMap = {
  education: EducationItem;
  work: ExperienceItem;
  internships: ExperienceItem;
  projects: ProjectItem;
  skills: SkillItem;
  certificates: CertificateItem;
  languages: LanguageItem;
  links: LinkItem;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function App(): JSX.Element {
  const [profile, setProfile] = useState<ResumeProfile>(() => createDefaultResumeProfile());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [jsonDraft, setJsonDraft] = useState("");
  const filledFields = useMemo(() => flattenResumeProfile(profile).length, [profile]);

  useEffect(() => {
    void getResumeProfile().then(setProfile);
  }, []);

  async function handleSave(): Promise<void> {
    setSaveState("saving");
    try {
      await saveResumeProfile(profile);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1600);
    } catch {
      setSaveState("error");
    }
  }

  function updateBasic(field: keyof ResumeProfile["basics"], value: string): void {
    setProfile((current) => ({
      ...current,
      basics: {
        ...current.basics,
        [field]: value
      }
    }));
  }

  function updateSectionItem<K extends keyof SectionItemMap>(
    section: K,
    id: string,
    patch: Partial<SectionItemMap[K]>
  ): void {
    setProfile((current) => {
      const sectionData = current[section];
      return {
        ...current,
        [section]: {
          ...sectionData,
          items: sectionData.items.map((item) =>
            item.id === id ? ({ ...item, ...patch } as SectionItemMap[K]) : item
          )
        }
      } as ResumeProfile;
    });
  }

  function addSectionItem<K extends keyof SectionItemMap>(
    section: K,
    createItem: () => SectionItemMap[K]
  ): void {
    setProfile((current) => ({
      ...current,
      [section]: {
        ...current[section],
        items: [...current[section].items, createItem()]
      }
    } as ResumeProfile));
  }

  function removeSectionItem(section: ResumeSectionName, id: string): void {
    setProfile((current) => {
      const sectionData = current[section];
      const items = sectionData.items as Array<{ id: string }>;
      const nextItems = items.filter((item) => item.id !== id);
      return {
        ...current,
        [section]: {
          ...sectionData,
          items: nextItems.length > 0 ? nextItems : sectionData.items
        }
      } as ResumeProfile;
    });
  }

  function exportJson(): void {
    setJsonDraft(JSON.stringify(profile, null, 2));
  }

  function importJson(): void {
    try {
      const parsed = JSON.parse(jsonDraft) as Partial<ResumeProfile>;
      setProfile(normalizeResumeProfile(parsed));
      setSaveState("idle");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <p className="eyebrow">Chrome MV3 本地模板</p>
          <h1>简历模板</h1>
        </div>
        <div className="topActions">
          <span className="fieldCount">{filledFields} 个可填写字段</span>
          <button className="secondaryButton" type="button" onClick={exportJson}>
            导出 JSON
          </button>
          <button className="primaryButton" type="button" onClick={handleSave}>
            {saveState === "saving" ? "保存中..." : "保存"}
          </button>
        </div>
      </header>

      {saveState === "saved" && <div className="banner success">已保存到浏览器本地。</div>}
      {saveState === "error" && <div className="banner error">操作失败，请检查输入内容。</div>}

      <section className="sectionBand">
        <div className="sectionHeading">
          <h2>基本信息</h2>
        </div>
        <div className="fieldGrid">
          <TextField label="姓名" value={profile.basics.fullName} onChange={(value) => updateBasic("fullName", value)} />
          <TextField label="常用名" value={profile.basics.preferredName} onChange={(value) => updateBasic("preferredName", value)} />
          <TextField label="手机号" value={profile.basics.phone} onChange={(value) => updateBasic("phone", value)} />
          <TextField label="邮箱" type="email" value={profile.basics.email} onChange={(value) => updateBasic("email", value)} />
          <TextField label="所在地" value={profile.basics.location} onChange={(value) => updateBasic("location", value)} />
          <TextField label="个人网站" value={profile.basics.website} onChange={(value) => updateBasic("website", value)} />
          <TextField label="GitHub" value={profile.basics.github} onChange={(value) => updateBasic("github", value)} />
          <TextField label="LinkedIn" value={profile.basics.linkedin} onChange={(value) => updateBasic("linkedin", value)} />
          <TextField
            label="个人简介"
            value={profile.basics.summary}
            onChange={(value) => updateBasic("summary", value)}
            multiline
            wide
          />
        </div>
      </section>

      <RepeatSection
        title="教育经历"
        items={profile.education.items}
        onAdd={() => addSectionItem("education", createEducationItem)}
        onRemove={(id) => removeSectionItem("education", id)}
        render={(item) => (
          <div className="fieldGrid">
            <TextField label="学校" value={item.school} onChange={(value) => updateSectionItem("education", item.id, { school: value })} />
            <TextField label="学历/学位" value={item.degree} onChange={(value) => updateSectionItem("education", item.id, { degree: value })} />
            <TextField label="专业" value={item.major} onChange={(value) => updateSectionItem("education", item.id, { major: value })} />
            <TextField label="开始时间" value={item.startDate} onChange={(value) => updateSectionItem("education", item.id, { startDate: value })} />
            <TextField label="结束时间" value={item.endDate} onChange={(value) => updateSectionItem("education", item.id, { endDate: value })} />
            <TextField label="GPA" value={item.gpa} onChange={(value) => updateSectionItem("education", item.id, { gpa: value })} />
            <TextField label="教育描述" value={item.description} onChange={(value) => updateSectionItem("education", item.id, { description: value })} multiline wide />
          </div>
        )}
      />

      <ExperienceSection
        title="工作经历"
        items={profile.work.items}
        onAdd={() => addSectionItem("work", () => createExperienceItem("work"))}
        onRemove={(id) => removeSectionItem("work", id)}
        onUpdate={(id, patch) => updateSectionItem("work", id, patch)}
      />

      <ExperienceSection
        title="实习经历"
        items={profile.internships.items}
        onAdd={() => addSectionItem("internships", () => createExperienceItem("intern"))}
        onRemove={(id) => removeSectionItem("internships", id)}
        onUpdate={(id, patch) => updateSectionItem("internships", id, patch)}
      />

      <RepeatSection
        title="项目经历"
        items={profile.projects.items}
        onAdd={() => addSectionItem("projects", createProjectItem)}
        onRemove={(id) => removeSectionItem("projects", id)}
        render={(item) => (
          <div className="fieldGrid">
            <TextField label="项目名称" value={item.name} onChange={(value) => updateSectionItem("projects", item.id, { name: value })} />
            <TextField label="项目角色" value={item.role} onChange={(value) => updateSectionItem("projects", item.id, { role: value })} />
            <TextField label="技术栈" value={item.technologies} onChange={(value) => updateSectionItem("projects", item.id, { technologies: value })} />
            <TextField label="开始时间" value={item.startDate} onChange={(value) => updateSectionItem("projects", item.id, { startDate: value })} />
            <TextField label="结束时间" value={item.endDate} onChange={(value) => updateSectionItem("projects", item.id, { endDate: value })} />
            <TextField label="项目链接" value={item.link} onChange={(value) => updateSectionItem("projects", item.id, { link: value })} />
            <TextField label="项目描述" value={item.description} onChange={(value) => updateSectionItem("projects", item.id, { description: value })} multiline wide />
          </div>
        )}
      />

      <RepeatSection
        title="技能"
        items={profile.skills.items}
        onAdd={() => addSectionItem("skills", createSkillItem)}
        onRemove={(id) => removeSectionItem("skills", id)}
        render={(item) => (
          <div className="fieldGrid">
            <TextField label="分类" value={item.category} onChange={(value) => updateSectionItem("skills", item.id, { category: value })} />
            <TextField label="技能内容" value={item.values} onChange={(value) => updateSectionItem("skills", item.id, { values: value })} wide />
          </div>
        )}
      />

      <RepeatSection
        title="证书"
        items={profile.certificates.items}
        onAdd={() => addSectionItem("certificates", createCertificateItem)}
        onRemove={(id) => removeSectionItem("certificates", id)}
        render={(item) => (
          <div className="fieldGrid">
            <TextField label="证书名称" value={item.name} onChange={(value) => updateSectionItem("certificates", item.id, { name: value })} />
            <TextField label="颁发机构" value={item.issuer} onChange={(value) => updateSectionItem("certificates", item.id, { issuer: value })} />
            <TextField label="获证时间" value={item.date} onChange={(value) => updateSectionItem("certificates", item.id, { date: value })} />
            <TextField label="证书编号" value={item.credentialId} onChange={(value) => updateSectionItem("certificates", item.id, { credentialId: value })} />
            <TextField label="证书链接" value={item.url} onChange={(value) => updateSectionItem("certificates", item.id, { url: value })} wide />
          </div>
        )}
      />

      <RepeatSection
        title="语言"
        items={profile.languages.items}
        onAdd={() => addSectionItem("languages", createLanguageItem)}
        onRemove={(id) => removeSectionItem("languages", id)}
        render={(item) => (
          <div className="fieldGrid">
            <TextField label="语言" value={item.language} onChange={(value) => updateSectionItem("languages", item.id, { language: value })} />
            <TextField label="熟练程度" value={item.proficiency} onChange={(value) => updateSectionItem("languages", item.id, { proficiency: value })} />
          </div>
        )}
      />

      <RepeatSection
        title="个人链接"
        items={profile.links.items}
        onAdd={() => addSectionItem("links", createLinkItem)}
        onRemove={(id) => removeSectionItem("links", id)}
        render={(item) => (
          <div className="fieldGrid">
            <TextField label="链接名称" value={item.label} onChange={(value) => updateSectionItem("links", item.id, { label: value })} />
            <TextField label="链接地址" value={item.url} onChange={(value) => updateSectionItem("links", item.id, { url: value })} wide />
          </div>
        )}
      />

      <section className="sectionBand">
        <div className="sectionHeading">
          <h2>JSON 备份</h2>
          <button className="secondaryButton" type="button" onClick={importJson}>
            导入到表单
          </button>
        </div>
        <textarea
          className="jsonBox"
          value={jsonDraft}
          onChange={(event) => setJsonDraft(event.target.value)}
          spellCheck={false}
          placeholder="点击“导出 JSON”后可复制备份；也可以粘贴 JSON 后导入。"
        />
      </section>
    </main>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  multiline?: boolean;
  wide?: boolean;
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
  wide = false
}: TextFieldProps): JSX.Element {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

interface RepeatSectionProps<T extends { id: string }> {
  title: string;
  items: T[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  render: (item: T) => JSX.Element;
}

function RepeatSection<T extends { id: string }>({
  title,
  items,
  onAdd,
  onRemove,
  render
}: RepeatSectionProps<T>): JSX.Element {
  return (
    <section className="sectionBand">
      <div className="sectionHeading">
        <h2>{title}</h2>
        <button className="secondaryButton" type="button" onClick={onAdd}>
          添加
        </button>
      </div>
      <div className="repeatList">
        {items.map((item, index) => (
          <article className="repeatCard" key={item.id}>
            <header>
              <strong>
                {title} #{index + 1}
              </strong>
              <button className="textButton" type="button" onClick={() => onRemove(item.id)}>
                删除
              </button>
            </header>
            {render(item)}
          </article>
        ))}
      </div>
    </section>
  );
}

interface ExperienceSectionProps {
  title: string;
  items: ExperienceItem[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ExperienceItem>) => void;
}

function ExperienceSection({
  title,
  items,
  onAdd,
  onRemove,
  onUpdate
}: ExperienceSectionProps): JSX.Element {
  return (
    <RepeatSection
      title={title}
      items={items}
      onAdd={onAdd}
      onRemove={onRemove}
      render={(item) => (
        <div className="fieldGrid">
          <TextField label="公司/单位" value={item.company} onChange={(value) => onUpdate(item.id, { company: value })} />
          <TextField label="职位" value={item.title} onChange={(value) => onUpdate(item.id, { title: value })} />
          <TextField label="地点" value={item.location} onChange={(value) => onUpdate(item.id, { location: value })} />
          <TextField label="开始时间" value={item.startDate} onChange={(value) => onUpdate(item.id, { startDate: value })} />
          <TextField label="结束时间" value={item.endDate} onChange={(value) => onUpdate(item.id, { endDate: value })} />
          <TextField label="经历描述" value={item.description} onChange={(value) => onUpdate(item.id, { description: value })} multiline wide />
        </div>
      )}
    />
  );
}
