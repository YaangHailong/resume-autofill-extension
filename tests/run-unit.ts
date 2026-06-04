import assert from "assert";
import { JSDOM } from "jsdom";
import { scanAddButtons, scanPageFields } from "../src/content/domScanner";
import { fillPlan } from "../src/content/filler";
import { createFillPlan } from "../src/shared/matcher";
import {
  createCertificateItem,
  createDefaultResumeProfile,
  flattenResumeProfile
} from "../src/shared/resume";
import { FillPlan } from "../src/shared/types";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [
  {
    name: "默认简历 schema 包含所有常用模块",
    run: () => {
      const profile = createDefaultResumeProfile();
      assert.strictEqual(profile.version, 1);
      assert.ok(profile.education.items.length >= 1);
      assert.ok(profile.work.items.length >= 1);
      assert.ok(profile.projects.items.length >= 1);
      assert.ok(profile.certificates.items.length >= 1);
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
      profile.basics.fullName = "张三";
      profile.basics.email = "zhangsan@example.com";
      profile.basics.phone = "13800000000";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      assert.strictEqual(plan.stats.confirmed, 3);
      assert.strictEqual(plan.stats.unmatched, 0);
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
      profile.basics.email = "zhangsan@example.com";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const emailMapping = plan.mappings.find((mapping) => mapping.resumePath === "basics.email");
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
      profile.basics.email = "zhangsan@example.com";

      const fields = scanPageFields();
      assert.strictEqual(fields[0].labelText, "邮箱");

      const plan = createFillPlan(profile, fields, scanAddButtons(), "https://example.com");
      const emailMapping = plan.mappings.find((mapping) => mapping.resumePath === "basics.email");
      assert.strictEqual(emailMapping?.status, "confirmed");
      assert.ok(emailMapping?.selector);
    }
  },
  {
    name: "字段冲突时一个网页字段不会被重复占用",
    run: () => {
      installDom(`
        <form>
          <label for="name">姓名</label><input id="name" />
          <label for="nickname">常用名</label><input id="nickname" />
        </form>
      `);

      const profile = createDefaultResumeProfile();
      profile.basics.fullName = "张三";
      profile.basics.preferredName = "San";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const selectors = plan.mappings.map((mapping) => mapping.selector).filter(Boolean);
      assert.strictEqual(new Set(selectors).size, selectors.length);
    }
  },
  {
    name: "证书多条数据会生成动态添加计划",
    run: () => {
      installDom(`
        <section>
          <h2>证书</h2>
          <label>证书名称 <input /></label>
          <button type="button">添加证书</button>
        </section>
      `);

      const profile = createDefaultResumeProfile();
      profile.certificates.items[0].name = "PMP";
      const second = createCertificateItem();
      second.name = "AWS Certified Developer";
      profile.certificates.items.push(second);

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const certAdd = plan.sectionAdds.find((item) => item.section === "certificates");
      assert.ok(certAdd);
      assert.strictEqual(certAdd?.addCount, 1);
    }
  },
  {
    name: "填写计划会写入 input、textarea 和 select",
    run: () => {
      installDom(`
        <form>
          <label for="name">姓名</label><input id="name" />
          <label for="summary">个人简介</label><textarea id="summary"></textarea>
          <label for="degree">学历</label>
          <select id="degree"><option></option><option>本科</option><option>硕士</option></select>
        </form>
      `);

      const profile = createDefaultResumeProfile();
      profile.basics.fullName = "李四";
      profile.basics.summary = "前端工程师";
      profile.education.items[0].degree = "本科";

      const plan = createFillPlan(profile, scanPageFields(), scanAddButtons(), "https://example.com");
      const result = fillPlan(plan);

      assert.ok(result.filled >= 3);
      assert.strictEqual((document.getElementById("name") as HTMLInputElement).value, "李四");
      assert.strictEqual(
        (document.getElementById("summary") as HTMLTextAreaElement).value,
        "前端工程师"
      );
      assert.strictEqual((document.getElementById("degree") as HTMLSelectElement).value, "本科");
    }
  },
  {
    name: "空模板不会产生可填写字段",
    run: () => {
      const profile = createDefaultResumeProfile();
      assert.strictEqual(flattenResumeProfile(profile).length, 0);
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
