import assert from "assert";
import { readFileSync } from "fs";
import { JSDOM } from "jsdom";
import { scanAddButtons, scanPageFields } from "../src/content/domScanner";
import { fillPlan } from "../src/content/filler";
import { inferSemanticsFromValues, normalizeText } from "../src/shared/fieldDictionary";
import { applyAiSuggestions, buildAiMatchingRequest } from "../src/shared/aiMatching";
import { createFillPlan } from "../src/shared/matcher";
import {
  createDefaultResumeProfile,
  createLanguageAbilityItem,
  createWorkExperienceItem,
  flattenResumeProfile
} from "../src/shared/resume";
import { FieldCandidate, FillPlan } from "../src/shared/types";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [
  {
    name: "默认简历 schema 按新东方表单结构生成",
    run: async () => {
      const profile = createDefaultResumeProfile();
      assert.strictEqual(profile.version, 2);
      assert.ok(profile.personalInfo);
      assert.ok(profile.jobIntention);
      assert.ok(profile.education.items.length >= 1);
      assert.ok(profile.work.items.length >= 1);
      assert.ok(profile.languages.items.length >= 1);
    }
  },
  {
    name: "中文表单能匹配姓名、邮箱和手机号",
    run: () => {
      installDom(`
        <form>
          <label for="name">姓名</label><input id="name" />
          <label for="email">邮箱</label><input id="email" type="email" />
          <label for="phone">手机号</label><input id="phone" type="tel" />
        </form>
      `);

      const profile = createDefaultResumeProfile();
      profile.personalInfo.fullName = "张三";
      profile.personalInfo.email = "zhangsan@example.com";
      profile.personalInfo.phone = "13800000000";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      assert.strictEqual(plan.stats.confirmed, 3);
      assert.strictEqual(plan.stats.unmatched, 0);
    }
  },
  {
    name: "求职意向字段能按表单标签匹配",
    run: () => {
      installDom(`
        <form>
          <label for="industry">期望从事行业</label><input id="industry" />
          <label for="city">期望工作城市</label><input id="city" />
          <label for="salary">期望月薪(税前)</label><input id="salary" />
        </form>
      `);

      const profile = createDefaultResumeProfile();
      profile.jobIntention.expectedIndustry = "教育培训";
      profile.jobIntention.expectedCity = "广州";
      profile.jobIntention.expectedMonthlySalary = "12000";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const byPath = new Map(plan.mappings.map((mapping) => [mapping.resumePath, mapping]));

      assert.strictEqual(byPath.get("jobIntention.expectedIndustry")?.status, "confirmed");
      assert.strictEqual(byPath.get("jobIntention.expectedCity")?.status, "confirmed");
      assert.strictEqual(byPath.get("jobIntention.expectedMonthlySalary")?.status, "confirmed");
    }
  },
  {
    name: "placeholder 精确等于字段名时能匹配邮箱",
    run: () => {
      installDom(`
        <form>
          <input placeholder="邮箱" />
        </form>
      `);

      const profile = createDefaultResumeProfile();
      profile.personalInfo.email = "zhangsan@example.com";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const emailMapping = plan.mappings.find((mapping) => mapping.resumePath === "personalInfo.email");
      assert.strictEqual(emailMapping?.status, "confirmed");
      assert.ok(emailMapping?.selector);
    }
  },
  {
    name: "左右两列布局的相邻标签能匹配邮箱",
    run: () => {
      installDom(`
        <form>
          <div class="form-row">
            <div class="form-label">邮箱*</div>
            <div class="form-control"><input placeholder="请输入常用邮箱" /></div>
          </div>
        </form>
      `);

      const profile = createDefaultResumeProfile();
      profile.personalInfo.email = "zhangsan@example.com";

      const fields = scanPageFields();
      assert.strictEqual(fields[0].labelText, "邮箱");

      const plan = createFillPlan(profile, fields, scanAddButtons(), "https://example.com");
      const emailMapping = plan.mappings.find((mapping) => mapping.resumePath === "personalInfo.email");
      assert.strictEqual(emailMapping?.status, "confirmed");
      assert.ok(emailMapping?.selector);
    }
  },
  {
    name: "字段冲突时一个网页字段不会被重复占用",
    run: () => {
      installDom(`
        <form>
          <label for="current">现从事行业</label><input id="current" />
          <label for="expected">期望从事行业</label><input id="expected" />
        </form>
      `);

      const profile = createDefaultResumeProfile();
      profile.jobIntention.currentIndustry = "教育";
      profile.jobIntention.expectedIndustry = "教育";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const selectors = plan.mappings.map((mapping) => mapping.selector).filter(Boolean);
      assert.strictEqual(new Set(selectors).size, selectors.length);
    }
  },
  {
    name: "语义归一化能容忍非字符串脏数据",
    run: () => {
      assert.strictEqual(normalizeText(undefined), "");
      assert.strictEqual(normalizeText(null), "");
      assert.strictEqual(normalizeText(2026), "2026");
      assert.deepStrictEqual(inferSemanticsFromValues([undefined, null, "硕士研究生"]), [
        "education_credential",
        "education_level"
      ]);
    }
  },
  {
    name: "页面写学位但选项是学历时能匹配模板学历",
    run: () => {
      installDom(`
        <form>
          <label for="credential">学位</label>
          <select id="credential">
            <option></option>
            <option>本科</option>
            <option>硕士研究生</option>
            <option>博士研究生</option>
          </select>
        </form>
      `);

      const profile = createDefaultResumeProfile();
      profile.education.items[0].educationLevel = "硕士研究生";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const mapping = plan.mappings.find(
        (item) => item.resumePath === "education.items[0].educationLevel"
      );

      assert.strictEqual(mapping?.status, "confirmed");
      assert.strictEqual(mapping?.fieldLabel, "学位");
    }
  },
  {
    name: "AI 匹配请求只发送低置信度字段且不发送真实目标值",
    run: () => {
      const profile = createDefaultResumeProfile();
      profile.personalInfo.email = "secret@example.com";
      profile.education.items[0].educationLevel = "硕士研究生";

      installDom(`
        <form>
          <label for="email">电子邮箱</label><input id="email" />
          <label for="credential">学位</label>
          <select id="credential">
            <option>本科</option>
            <option>硕士研究生</option>
          </select>
        </form>
      `);

      const candidates = scanPageFields();
      const plan = createFillPlan(profile, candidates, scanAddButtons(), "https://example.com");
      const request = buildAiMatchingRequest(plan, candidates);
      const serialized = JSON.stringify(request);

      assert.ok(request.resumeFields.every((field) => field.currentStatus !== "confirmed"));
      assert.ok(!serialized.includes("secret@example.com"));
      assert.ok(!serialized.includes("硕士研究生\"") || serialized.includes("\"options\""));
    }
  },
  {
    name: "AI 建议能合并到预览计划但不会覆盖已确认字段",
    run: () => {
      const candidates = createAiMergeCandidates();
      const plan = createAiMergePlan();
      const enhanced = applyAiSuggestions(plan, candidates, {
        mappings: [
          {
            resumePath: "personalInfo.email",
            candidateId: "field-degree",
            confidence: 92,
            reason: "错误建议，不应覆盖已确认字段。"
          },
          {
            resumePath: "education.items[0].degree",
            candidateId: "field-degree",
            confidence: 88,
            reason: "字段标签和语义都指向学位。"
          }
        ]
      });
      const byPath = new Map(enhanced.mappings.map((mapping) => [mapping.resumePath, mapping]));

      assert.strictEqual(byPath.get("personalInfo.email")?.candidateId, "field-email");
      assert.strictEqual(byPath.get("education.items[0].degree")?.candidateId, "field-degree");
      assert.strictEqual(byPath.get("education.items[0].degree")?.status, "confirmed");
      assert.strictEqual(enhanced.ai?.applied, 1);
    }
  },
  {
    name: "全局最高分分配避免学历抢走真正的学位字段",
    run: () => {
      installDom(`
        <form>
          <label for="degree">学位</label><input id="degree" />
        </form>
      `);

      const profile = createDefaultResumeProfile();
      profile.education.items[0].educationLevel = "硕士研究生";
      profile.education.items[0].degree = "硕士学位";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const byPath = new Map(plan.mappings.map((mapping) => [mapping.resumePath, mapping]));

      assert.strictEqual(byPath.get("education.items[0].degree")?.status, "confirmed");
      assert.strictEqual(byPath.get("education.items[0].educationLevel")?.status, "unmatched");
    }
  },
  {
    name: "手机号组合控件优先匹配真实手机号输入框",
    run: () => {
      installDom(`
        <form>
          <div class="form-item">
            <div class="form-item__title"><label class="form-item__text">手机号</label></div>
            <div class="form-item__control">
              <input value="中国大陆" />
              <input placeholder="请输入11位手机号" value="18729783910" />
            </div>
          </div>
        </form>
      `);

      const profile = createDefaultResumeProfile();
      profile.personalInfo.phone = "18729783910";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const phoneMapping = plan.mappings.find((mapping) => mapping.resumePath === "personalInfo.phone");

      assert.strictEqual(phoneMapping?.targetValue, "18729783910");
      assert.ok(phoneMapping?.fieldLabel?.includes("手机号"));
      const element = document.querySelector(phoneMapping?.selector ?? "") as HTMLInputElement;
      assert.strictEqual(element.value, "18729783910");
    }
  },
  {
    name: "语言多条数据会生成动态添加计划",
    run: () => {
      installDom(`
        <section>
          <h2>语言能力</h2>
          <label>语言类型 <input /></label>
          <button type="button">添加语言能力</button>
        </section>
      `);

      const profile = createDefaultResumeProfile();
      profile.languages.items[0].languageType = "英语";
      const second = createLanguageAbilityItem();
      second.languageType = "日语";
      profile.languages.items.push(second);

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const languageAdd = plan.sectionAdds.find((item) => item.section === "languages");
      assert.ok(languageAdd);
      assert.strictEqual(languageAdd?.addCount, 1);
    }
  },
  {
    name: "填写计划会写入 input、textarea 和 select",
    run: async () => {
      installDom(`
        <form>
          <label for="name">姓名</label><input id="name" />
          <label for="responsibilities">工作职责</label><textarea id="responsibilities"></textarea>
          <label for="educationLevel">学历</label>
          <select id="educationLevel"><option></option><option>本科</option><option>硕士研究生</option></select>
        </form>
      `);

      const profile = createDefaultResumeProfile();
      profile.personalInfo.fullName = "李四";
      profile.work.items[0].responsibilities = "负责课程平台前端开发";
      profile.education.items[0].educationLevel = "硕士研究生";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const result = await fillPlan(plan);

      assert.ok(result.filled >= 3);
      assert.strictEqual((document.getElementById("name") as HTMLInputElement).value, "李四");
      assert.strictEqual(
        (document.getElementById("responsibilities") as HTMLTextAreaElement).value,
        "负责课程平台前端开发"
      );
      assert.strictEqual(
        (document.getElementById("educationLevel") as HTMLSelectElement).value,
        "硕士研究生"
      );
    }
  },
  {
    name: "自定义下拉框会点击匹配的弹层选项",
    run: async () => {
      installDom(`
        <form>
          <div class="form-item">
            <div class="form-item__title"><label class="form-item__text">学历</label></div>
            <div class="form-item__control">
              <div class="phoenix-select"><input id="customEducationLevel" value="" /></div>
            </div>
          </div>
          <div class="phoenix-single-select-list__content-item">本科</div>
          <div class="phoenix-single-select-list__content-item">硕士研究生</div>
        </form>
      `);

      const input = document.getElementById("customEducationLevel") as HTMLInputElement;
      document.querySelectorAll<HTMLElement>(".phoenix-single-select-list__content-item").forEach((option) => {
        option.addEventListener("click", () => {
          input.value = option.textContent?.trim() ?? "";
        });
      });

      const profile = createDefaultResumeProfile();
      profile.education.items[0].educationLevel = "硕士研究生";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const result = await fillPlan(plan);

      assert.ok(result.filled >= 1);
      assert.strictEqual(input.value, "硕士研究生");
    }
  },
  {
    name: "自定义时间框找不到选项时会写入并触发事件",
    run: async () => {
      installDom(`
        <form>
          <div class="form-item">
            <div class="form-item__title"><label class="form-item__text">开始时间</label></div>
            <div class="form-item__control">
              <div class="phoenix-select phoenix-select--editable"><input id="customStartDate" value="" /></div>
            </div>
          </div>
        </form>
      `);

      const input = document.getElementById("customStartDate") as HTMLInputElement;
      let changeEvents = 0;
      input.addEventListener("change", () => {
        changeEvents += 1;
      });

      const profile = createDefaultResumeProfile();
      profile.education.items[0].startDate = "2024-09";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const result = await fillPlan(plan);

      assert.ok(result.filled >= 1);
      assert.strictEqual(input.value, "2024-09");
      assert.ok(changeEvents >= 1);
    }
  },
  {
    name: "年月选择器会切换年份并点击目标月份",
    run: async () => {
      installDom(`
        <form>
          <div class="form-item">
            <div class="form-item__title"><label class="form-item__text">开始时间</label></div>
            <div class="form-item__control">
              <div class="phoenix-select phoenix-select--editable"><input id="monthPickerInput" value="" /></div>
            </div>
          </div>
          <div class="phoenix-month-picker">
            <button type="button" id="prevYear">«</button>
            <strong id="yearLabel">2026年</strong>
            <button type="button" id="nextYear">»</button>
            <div class="monthGrid">
              <button type="button">1月</button>
              <button type="button">2月</button>
              <button type="button">3月</button>
              <button type="button">4月</button>
              <button type="button">5月</button>
              <button type="button">6月</button>
              <button type="button">7月</button>
              <button type="button">8月</button>
              <button type="button">9月</button>
              <button type="button">10月</button>
              <button type="button">11月</button>
              <button type="button">12月</button>
            </div>
          </div>
        </form>
      `);

      const input = document.getElementById("monthPickerInput") as HTMLInputElement;
      const yearLabel = document.getElementById("yearLabel") as HTMLElement;
      document.getElementById("prevYear")?.addEventListener("click", () => {
        const current = Number(yearLabel.textContent?.match(/\d{4}/)?.[0] ?? "2026");
        yearLabel.textContent = `${current - 1}年`;
      });
      document.getElementById("nextYear")?.addEventListener("click", () => {
        const current = Number(yearLabel.textContent?.match(/\d{4}/)?.[0] ?? "2026");
        yearLabel.textContent = `${current + 1}年`;
      });
      document.querySelectorAll<HTMLButtonElement>(".monthGrid button").forEach((button) => {
        button.addEventListener("click", () => {
          const year = yearLabel.textContent?.match(/\d{4}/)?.[0] ?? "";
          const month = button.textContent?.match(/\d+/)?.[0]?.padStart(2, "0") ?? "";
          input.value = `${year}-${month}`;
        });
      });

      const profile = createDefaultResumeProfile();
      profile.education.items[0].startDate = "2024-09";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const result = await fillPlan(plan);

      assert.ok(result.filled >= 1);
      assert.strictEqual(yearLabel.textContent, "2024年");
      assert.strictEqual(input.value, "2024-09");
    }
  },
  {
    name: "空模板不会产生可填写字段",
    run: () => {
      const profile = createDefaultResumeProfile();
      assert.strictEqual(flattenResumeProfile(profile).length, 0);
    }
  },
  {
    name: "新东方静态页不会把备案链接识别成动态添加按钮",
    run: () => {
      installDom(readFixture("招聘网页/新东方招简历网页.html"));

      const addButtons = scanAddButtons();
      const addButtonTexts = addButtons.map((button) => button.text);

      assert.ok(addButtonTexts.some((text) => text.includes("添加工作经历")));
      assert.ok(addButtonTexts.some((text) => text.includes("添加语言能力")));
      assert.ok(addButtonTexts.every((text) => !text.includes("ICP备")));
      assert.ok(addButtonTexts.every((text) => !text.includes("隐私政策")));
    }
  },
  {
    name: "新东方静态页的自定义表单 label 能用于匹配",
    run: () => {
      installDom(readFixture("招聘网页/新东方招简历网页.html"));

      const profile = createDefaultResumeProfile();
      profile.personalInfo.fullName = "杨海龙";
      profile.personalInfo.phone = "18729783910";
      profile.personalInfo.email = "2054258338@qq.com";
      profile.education.items[0].schoolName = "西安理工大学";
      profile.education.items[0].educationLevel = "硕士研究生";
      profile.education.items[0].degree = "硕士学位";
      profile.education.items[0].majorName = "计算机技术";

      const fields = scanPageFields();
      const labels = fields.map((field) => field.labelText);
      assert.ok(labels.includes("邮箱"));
      assert.ok(labels.includes("手机号"));
      assert.ok(labels.includes("学校名称"));
      assert.ok(labels.includes("学历"));
      assert.ok(labels.includes("学位"));
      assert.ok(labels.includes("专业名称"));

      const plan = createFillPlan(profile, fields, scanAddButtons(), "https://zhaopin.xdf.cn");
      const byPath = new Map(plan.mappings.map((mapping) => [mapping.resumePath, mapping]));

      assert.strictEqual(byPath.get("personalInfo.email")?.status, "confirmed");
      assert.strictEqual(byPath.get("personalInfo.phone")?.status, "confirmed");
      assert.strictEqual(byPath.get("education.items[0].schoolName")?.status, "confirmed");
      assert.strictEqual(byPath.get("education.items[0].educationLevel")?.status, "confirmed");
      assert.strictEqual(byPath.get("education.items[0].degree")?.status, "confirmed");
      assert.strictEqual(byPath.get("education.items[0].majorName")?.status, "confirmed");
      assert.ok(plan.sectionAdds.every((item) => !item.addButtonText.includes("ICP备")));
    }
  },
  {
    name: "新东方静态页动态添加只选择对应模块按钮",
    run: () => {
      installDom(readFixture("招聘网页/新东方招简历网页.html"));

      const profile = createDefaultResumeProfile();
      profile.work.items[0].unitName = "第一家公司";
      const secondWork = createWorkExperienceItem("work");
      secondWork.unitName = "第二家公司";
      profile.work.items.push(secondWork);
      profile.languages.items[0].languageType = "英语";
      const secondLanguage = createLanguageAbilityItem();
      secondLanguage.languageType = "日语";
      profile.languages.items.push(secondLanguage);
      profile.education.items[0].schoolName = "第一所学校";
      profile.education.items.push({
        ...profile.education.items[0],
        id: "edu-second",
        schoolName: "第二所学校"
      });

      const plan = createFillPlan(
        profile,
        scanPageFields(),
        scanAddButtons(),
        "https://zhaopin.xdf.cn"
      );
      const addsBySection = new Map(plan.sectionAdds.map((item) => [item.section, item]));

      assert.strictEqual(addsBySection.get("education")?.addButtonText, "添加教育经历");
      assert.strictEqual(addsBySection.get("work")?.addButtonText, "添加工作经历");
      assert.strictEqual(addsBySection.get("languages")?.addButtonText, "添加语言能力");
      assert.ok(plan.sectionAdds.every((item) => !item.addButtonText.includes("ICP备")));
    }
  }
];

runAll().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function runAll(): Promise<void> {
  for (const test of tests) {
    await test.run();
    console.log(`ok - ${test.name}`);
  }
  console.log(`${tests.length} tests passed`);
}

function installDom(markup: string): void {
  const dom = new JSDOM(markup, {
    url: "https://example.com/jobs/apply",
    pretendToBeVisual: true
  });

  Object.defineProperty(dom.window.HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return dom.window.document.body;
    }
  });

  patchRects(dom);

  (globalThis as unknown as { window: Window }).window = dom.window as unknown as Window;
  (globalThis as unknown as { document: Document }).document = dom.window.document;
  (globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement =
    dom.window.HTMLElement as typeof HTMLElement;
  (globalThis as unknown as { HTMLInputElement: typeof HTMLInputElement }).HTMLInputElement =
    dom.window.HTMLInputElement as typeof HTMLInputElement;
  (globalThis as unknown as { HTMLTextAreaElement: typeof HTMLTextAreaElement }).HTMLTextAreaElement =
    dom.window.HTMLTextAreaElement as typeof HTMLTextAreaElement;
  (globalThis as unknown as { HTMLSelectElement: typeof HTMLSelectElement }).HTMLSelectElement =
    dom.window.HTMLSelectElement as typeof HTMLSelectElement;
  (globalThis as unknown as { HTMLButtonElement: typeof HTMLButtonElement }).HTMLButtonElement =
    dom.window.HTMLButtonElement as typeof HTMLButtonElement;
  (globalThis as unknown as { Event: typeof Event }).Event = dom.window.Event as typeof Event;
  (globalThis as unknown as { CSS: typeof CSS }).CSS = {
    escape: (value: string) => value.replace(/"/g, '\\"')
  } as typeof CSS;
}

function readFixture(path: string): string {
  return readFileSync(path, "utf8");
}

function createAiMergePlan(): FillPlan {
  return {
    id: "plan-ai",
    origin: "https://example.com",
    createdAt: new Date().toISOString(),
    sectionAdds: [],
    stats: {
      confirmed: 1,
      needsReview: 0,
      unmatched: 1,
      dynamicAdds: 0
    },
    mappings: [
      {
        id: "mapping-email",
        resumePath: "personalInfo.email",
        resumeLabel: "邮箱",
        fieldKey: "email",
        targetValue: "secret@example.com",
        candidateId: "field-email",
        selector: "#email",
        fieldLabel: "邮箱",
        confidence: 96,
        reason: "标签精确匹配。",
        status: "confirmed"
      },
      {
        id: "mapping-degree",
        resumePath: "education.items[0].degree",
        resumeLabel: "学位 #1",
        fieldKey: "degree",
        section: "education",
        itemIndex: 0,
        targetValue: "硕士学位",
        confidence: 0,
        reason: "没有找到足够相似的网页字段。",
        status: "unmatched"
      }
    ]
  };
}

function createAiMergeCandidates(): FieldCandidate[] {
  return [
    {
      id: "field-email",
      selector: "#email",
      tagName: "input",
      kind: "email",
      inputType: "email",
      labelText: "邮箱",
      placeholder: "",
      name: "",
      idAttr: "email",
      ariaLabel: "",
      contextText: "",
      value: "",
      options: []
    },
    {
      id: "field-degree",
      selector: "#degree",
      tagName: "select",
      kind: "select",
      inputType: "",
      labelText: "学位",
      placeholder: "请选择",
      name: "",
      idAttr: "degree",
      ariaLabel: "",
      contextText: "教育经历",
      value: "",
      options: ["学士", "硕士", "博士"],
      sectionHint: "education"
    }
  ];
}

function patchRects(dom: JSDOM): void {
  dom.window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      width: 120,
      height: 32,
      top: 0,
      right: 120,
      bottom: 32,
      left: 0,
      toJSON: () => ({})
    };
  };
}
