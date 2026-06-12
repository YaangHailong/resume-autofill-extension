import { useEffect, useMemo, useState } from "react";
import {
  createDefaultResumeProfile,
  createEducationItem,
  createLanguageAbilityItem,
  createWorkExperienceItem,
  flattenResumeProfile,
  normalizeResumeProfile
} from "../shared/resume";
import {
  DEFAULT_AI_MATCHING_ENDPOINT,
  getAiMatchingSettings,
  getResumeProfile,
  saveAiMatchingSettings,
  saveResumeProfile
} from "../shared/storage";
import {
  AiMatchingSettings,
  EducationItem,
  JobIntention,
  LanguageAbilityItem,
  PersonalInfo,
  ResumeProfile,
  ResumeSectionName,
  WorkExperienceItem
} from "../shared/types";

type SectionItemMap = {
  education: EducationItem;
  work: WorkExperienceItem;
  languages: LanguageAbilityItem;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function App(): JSX.Element {
  const [profile, setProfile] = useState<ResumeProfile>(() => createDefaultResumeProfile());
  const [aiSettings, setAiSettings] = useState<AiMatchingSettings>({
    enabled: false,
    endpoint: DEFAULT_AI_MATCHING_ENDPOINT
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [jsonDraft, setJsonDraft] = useState("");
  const filledFields = useMemo(() => flattenResumeProfile(profile).length, [profile]);

  useEffect(() => {
    void Promise.all([getResumeProfile(), getAiMatchingSettings()]).then(
      ([storedProfile, storedAiSettings]) => {
        setProfile(storedProfile);
        setAiSettings(storedAiSettings);
      }
    );
  }, []);

  async function handleSave(): Promise<void> {
    setSaveState("saving");
    try {
      await Promise.all([saveResumeProfile(profile), saveAiMatchingSettings(aiSettings)]);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1600);
    } catch {
      setSaveState("error");
    }
  }

  function updatePersonalInfo(field: keyof PersonalInfo, value: string): void {
    setProfile((current) => ({
      ...current,
      personalInfo: {
        ...current.personalInfo,
        [field]: value
      }
    }));
  }

  function updateJobIntention(field: keyof JobIntention, value: string): void {
    setProfile((current) => ({
      ...current,
      jobIntention: {
        ...current.jobIntention,
        [field]: value
      }
    }));
  }

  function updateAiSettings(patch: Partial<AiMatchingSettings>): void {
    setAiSettings((current) => ({
      ...current,
      ...patch
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
          <p className="eyebrow">新东方招聘表单模板</p>
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
          <h2>AI 增强匹配（可选）</h2>
        </div>
        <label className="switchField">
          <input
            type="checkbox"
            checked={aiSettings.enabled}
            onChange={(event) => updateAiSettings({ enabled: event.target.checked })}
          />
          <span>启用 AI 兜底匹配，只处理未匹配和需确认字段。</span>
        </label>
        <div className="fieldGrid">
          <TextField
            label="后端接口地址"
            value={aiSettings.endpoint}
            onChange={(value) => updateAiSettings({ endpoint: value })}
            wide
          />
        </div>
        <p className="helpText">
          这里不要填写火山方舟 API Key。扩展只请求你的后端接口，后端再读取 ARK_API_KEY 调用火山方舟。
        </p>
      </section>

      <section className="sectionBand">
        <div className="sectionHeading">
          <h2>个人信息</h2>
        </div>
        <div className="fieldGrid">
          <TextField label="姓名" value={profile.personalInfo.fullName} onChange={(value) => updatePersonalInfo("fullName", value)} />
          <TextField label="性别" value={profile.personalInfo.gender} onChange={(value) => updatePersonalInfo("gender", value)} />
          <TextField label="出生日期" value={profile.personalInfo.birthDate} onChange={(value) => updatePersonalInfo("birthDate", value)} />
          <TextField label="邮箱" type="email" value={profile.personalInfo.email} onChange={(value) => updatePersonalInfo("email", value)} />
          <TextField label="手机号" value={profile.personalInfo.phone} onChange={(value) => updatePersonalInfo("phone", value)} />
          <TextField label="工作年限" value={profile.personalInfo.workYears} onChange={(value) => updatePersonalInfo("workYears", value)} />
          <TextField label="证件照备注" value={profile.personalInfo.photoNote} onChange={(value) => updatePersonalInfo("photoNote", value)} wide />
        </div>
      </section>

      <section className="sectionBand">
        <div className="sectionHeading">
          <h2>求职意向</h2>
        </div>
        <div className="fieldGrid">
          <TextField label="现从事行业" value={profile.jobIntention.currentIndustry} onChange={(value) => updateJobIntention("currentIndustry", value)} />
          <TextField label="现从事职业" value={profile.jobIntention.currentOccupation} onChange={(value) => updateJobIntention("currentOccupation", value)} />
          <TextField label="现工作城市" value={profile.jobIntention.currentCity} onChange={(value) => updateJobIntention("currentCity", value)} />
          <TextField label="现月薪(税前)" value={profile.jobIntention.currentMonthlySalary} onChange={(value) => updateJobIntention("currentMonthlySalary", value)} />
          <TextField label="期望从事行业" value={profile.jobIntention.expectedIndustry} onChange={(value) => updateJobIntention("expectedIndustry", value)} />
          <TextField label="期望从事职业" value={profile.jobIntention.expectedOccupation} onChange={(value) => updateJobIntention("expectedOccupation", value)} />
          <TextField label="期望工作城市" value={profile.jobIntention.expectedCity} onChange={(value) => updateJobIntention("expectedCity", value)} />
          <TextField label="期望月薪(税前)" value={profile.jobIntention.expectedMonthlySalary} onChange={(value) => updateJobIntention("expectedMonthlySalary", value)} />
          <TextField label="到岗时间" value={profile.jobIntention.availability} onChange={(value) => updateJobIntention("availability", value)} />
        </div>
      </section>

      <RepeatSection
        title="教育经历"
        items={profile.education.items}
        onAdd={() => addSectionItem("education", createEducationItem)}
        onRemove={(id) => removeSectionItem("education", id)}
        render={(item) => (
          <div className="fieldGrid">
            <TextField label="学校名称" value={item.schoolName} onChange={(value) => updateSectionItem("education", item.id, { schoolName: value })} />
            <TextField label="开始时间" value={item.startDate} onChange={(value) => updateSectionItem("education", item.id, { startDate: value })} />
            <TextField label="结束时间" value={item.endDate} onChange={(value) => updateSectionItem("education", item.id, { endDate: value })} />
            <TextField label="专业名称" value={item.majorName} onChange={(value) => updateSectionItem("education", item.id, { majorName: value })} />
            <TextField label="学历" value={item.educationLevel} onChange={(value) => updateSectionItem("education", item.id, { educationLevel: value })} />
            <TextField label="学位" value={item.degree} onChange={(value) => updateSectionItem("education", item.id, { degree: value })} />
          </div>
        )}
      />

      <RepeatSection
        title="工作经历"
        items={profile.work.items}
        onAdd={() => addSectionItem("work", () => createWorkExperienceItem("work"))}
        onRemove={(id) => removeSectionItem("work", id)}
        render={(item) => (
          <div className="fieldGrid">
            <TextField label="单位名称" value={item.unitName} onChange={(value) => updateSectionItem("work", item.id, { unitName: value })} />
            <TextField label="职位名称" value={item.positionName} onChange={(value) => updateSectionItem("work", item.id, { positionName: value })} />
            <TextField label="开始时间" value={item.startDate} onChange={(value) => updateSectionItem("work", item.id, { startDate: value })} />
            <TextField label="结束时间" value={item.endDate} onChange={(value) => updateSectionItem("work", item.id, { endDate: value })} />
            <TextField label="工作职责" value={item.responsibilities} onChange={(value) => updateSectionItem("work", item.id, { responsibilities: value })} multiline wide />
          </div>
        )}
      />

      <RepeatSection
        title="语言能力"
        items={profile.languages.items}
        onAdd={() => addSectionItem("languages", createLanguageAbilityItem)}
        onRemove={(id) => removeSectionItem("languages", id)}
        render={(item) => (
          <div className="fieldGrid">
            <TextField label="语言类型" value={item.languageType} onChange={(value) => updateSectionItem("languages", item.id, { languageType: value })} />
            <TextField label="掌握程度" value={item.mastery} onChange={(value) => updateSectionItem("languages", item.id, { mastery: value })} />
            <TextField label="听说" value={item.listeningSpeaking} onChange={(value) => updateSectionItem("languages", item.id, { listeningSpeaking: value })} />
            <TextField label="读写" value={item.readingWriting} onChange={(value) => updateSectionItem("languages", item.id, { readingWriting: value })} />
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
