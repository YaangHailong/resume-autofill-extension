import { normalizeText } from "../shared/fieldDictionary";
import { FieldMapping, FillPlan, SectionAddPlan } from "../shared/types";
import { queryAutofillElement, scanAddButtons, scanPageFields } from "./domScanner";
import { createFillPlan } from "../shared/matcher";
import { ResumeProfile, UserMappingOverride } from "../shared/types";

export interface FillResult {
  filled: number;
  skipped: number;
  addedSections: number;
}

interface YearMonthTarget {
  year: number;
  month: number;
}

const CUSTOM_CONTROL_SELECTOR = [
  ".phoenix-select",
  ".phoenix-date-picker",
  ".ant-select",
  ".ant-picker",
  ".el-select",
  ".el-date-editor",
  ".ivu-select",
  ".rc-select",
  ".form-item__control"
].join(",");

// 常见组件库会把下拉项渲染到 body 末尾，填写时需要从全局弹层里找选项。
const POPUP_OPTION_SELECTOR = [
  "[role='option']",
  ".phoenix-single-select-list__content-item",
  ".phoenix-single-select-list__item",
  ".phoenix-select-option",
  ".phoenix-select__option",
  ".ant-select-item-option",
  ".el-select-dropdown__item",
  ".ivu-select-item",
  ".rc-select-item-option",
  ".select-option",
  ".dropdown-item",
  "li"
].join(",");

export async function executeFillWithDynamicAdds(
  profile: ResumeProfile,
  origin: string,
  overrides: UserMappingOverride[],
  skipPaths: string[]
): Promise<{ plan: FillPlan; result: FillResult }> {
  // 动态区块必须先添加，再重新扫描，否则新增出来的输入框不会在旧计划里。
  const initialPlan = createFillPlan(
    profile,
    scanPageFields(),
    scanAddButtons(),
    origin,
    overrides
  );

  const addedSections = await applySectionAdds(initialPlan.sectionAdds);
  const refreshedPlan = createFillPlan(
    profile,
    scanPageFields(),
    scanAddButtons(),
    origin,
    overrides
  );
  const result = await fillPlan(refreshedPlan, skipPaths);

  return {
    plan: refreshedPlan,
    result: {
      ...result,
      addedSections
    }
  };
}

export async function applySectionAdds(sectionAdds: SectionAddPlan[]): Promise<number> {
  let total = 0;
  for (const sectionAdd of sectionAdds) {
    const addCount = Math.min(sectionAdd.addCount, 5);
    for (let index = 0; index < addCount; index += 1) {
      const element = queryAutofillElement(sectionAdd.addButtonSelector);
      if (!element) {
        break;
      }
      // 添加一次等页面稳定一次，避免连续点击时前端还没渲染完新增区块。
      element.click();
      total += 1;
      await waitForPageToSettle();
    }
  }
  return total;
}

export async function fillPlan(plan: FillPlan, skipPaths: string[] = []): Promise<FillResult> {
  let filled = 0;
  let skipped = 0;
  const skipSet = new Set(skipPaths);

  for (const mapping of plan.mappings) {
    if (skipSet.has(mapping.resumePath) || mapping.status === "unmatched" || !mapping.selector) {
      skipped += 1;
      continue;
    }

    const element = queryAutofillElement(mapping.selector);
    if (!element) {
      skipped += 1;
      continue;
    }

    if (await fillElement(element, mapping)) {
      filled += 1;
    } else {
      skipped += 1;
    }
  }

  return { filled, skipped, addedSections: 0 };
}

export async function fillElement(element: HTMLElement, mapping: FieldMapping): Promise<boolean> {
  const targetValue = mapping.targetValue;
  if (element instanceof HTMLSelectElement) {
    return fillSelect(element, targetValue);
  }

  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") {
      element.checked = shouldCheckChoice(element, mapping);
      dispatchValueEvents(element);
      return true;
    }
    if (element.type === "radio") {
      const shouldCheck = shouldCheckChoice(element, mapping);
      if (shouldCheck) {
        element.checked = true;
        dispatchValueEvents(element);
      }
      return shouldCheck;
    }
    if (await fillCustomControl(element, mapping)) {
      return true;
    }
    setInputValue(element, targetValue);
    return true;
  }

  if (element instanceof HTMLTextAreaElement) {
    setInputValue(element, targetValue);
    return true;
  }

  if (element.isContentEditable || element.getAttribute("role") === "textbox") {
    element.textContent = targetValue;
    dispatchValueEvents(element);
    return true;
  }

  return false;
}

async function fillCustomControl(
  element: HTMLInputElement,
  mapping: FieldMapping
): Promise<boolean> {
  const root = element.closest<HTMLElement>(CUSTOM_CONTROL_SELECTOR);
  if (!root || isPlainTextInput(element, mapping)) {
    return false;
  }

  // 自定义 select/date 控件必须先像用户一样点击打开弹层，再选择真实选项。
  await openCustomControl(root, element, mapping.targetValue);

  if (await selectYearMonthFromPopup(mapping.targetValue, element)) {
    dispatchValueEvents(element);
    return true;
  }

  const option = findMatchingPopupOption(mapping.targetValue);
  if (option) {
    clickElement(option);
    await waitForPageToSettle(80);
    dispatchValueEvents(element);
    return true;
  }

  // 对可输入的时间/下拉框做兜底：写值、按 Enter、失焦，尽量触发组件内部状态更新。
  setInputValue(element, mapping.targetValue);
  dispatchKeyboardEvent(element, "keydown", "Enter");
  dispatchKeyboardEvent(element, "keyup", "Enter");
  element.blur();
  dispatchFocusEvent(element, "blur", false);
  dispatchFocusEvent(element, "focusout", true);
  await waitForPageToSettle(80);
  return true;
}

function fillSelect(element: HTMLSelectElement, targetValue: string): boolean {
  const normalizedTarget = normalizeText(targetValue);
  const options = Array.from(element.options);
  const exact = options.find(
    (option) =>
      normalizeText(option.value) === normalizedTarget ||
      normalizeText(option.textContent ?? "") === normalizedTarget
  );
  const fuzzy = options.find((option) => {
    const optionText = normalizeText(`${option.value} ${option.textContent ?? ""}`);
    return optionText.includes(normalizedTarget) || normalizedTarget.includes(optionText);
  });
  const option = exact ?? fuzzy;
  if (!option) {
    return false;
  }
  element.value = option.value;
  dispatchValueEvents(element);
  return true;
}

function isPlainTextInput(element: HTMLInputElement, mapping: FieldMapping): boolean {
  const fieldKey = mapping.fieldKey;
  const customRoot = element.closest<HTMLElement>(
    ".phoenix-select, .phoenix-date-picker, .ant-select, .ant-picker, .el-select, .el-date-editor, .ivu-select, .rc-select"
  );
  if (customRoot) {
    return false;
  }
  return !["birthDate", "startDate", "endDate", "availability"].includes(fieldKey);
}

async function openCustomControl(
  root: HTMLElement,
  element: HTMLInputElement,
  targetValue: string
): Promise<void> {
  element.focus();

  // 日期/下拉组件的真实触发点不固定，可能在 input、日历图标或外层容器上。
  for (const target of getCustomControlClickTargets(root, element)) {
    clickElement(target);
    await waitForPageToSettle(140);
    if (isPopupReadyForTarget(targetValue)) {
      return;
    }
  }

  // 部分可输入 select 只监听键盘打开事件，额外补一次 ArrowDown。
  dispatchKeyboardEvent(element, "keydown", "ArrowDown");
  dispatchKeyboardEvent(element, "keyup", "ArrowDown");
  await waitForPageToSettle(140);
}

function getCustomControlClickTargets(
  root: HTMLElement,
  element: HTMLInputElement
): HTMLElement[] {
  const triggers = Array.from(
    root.querySelectorAll<HTMLElement>(
      [
        ".phoenix-select__switchArrow",
        ".phoenix-select__arrow",
        ".phoenix-date-picker__suffix",
        ".ant-picker-suffix",
        ".ant-select-arrow",
        ".el-input__suffix",
        ".ivu-select-arrow",
        "[class*='switchArrow']",
        "[class*='picker'] [class*='suffix']",
        "[aria-label*='calendar' i]",
        "[title*='calendar' i]",
        "svg"
      ].join(",")
    )
  );

  return uniqueElements([element, ...triggers, root]);
}

function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter((element, index, list) => list.indexOf(element) === index);
}

function isPopupReadyForTarget(targetValue: string): boolean {
  if (parseYearMonth(targetValue)) {
    return Boolean(findYearMonthPanel() ?? findYearPanel() ?? findMonthOnlyPanel());
  }
  return Boolean(findMatchingPopupOption(targetValue));
}

function clickElement(element: HTMLElement): void {
  dispatchMouseEvent(element, "mousedown");
  dispatchMouseEvent(element, "mouseup");
  element.click();
}

async function selectYearMonthFromPopup(
  targetValue: string,
  input?: HTMLInputElement
): Promise<boolean> {
  const target = parseYearMonth(targetValue);
  if (!target) {
    return false;
  }

  if (await selectMonthFromYearMonthPanel(target)) {
    ensureYearMonthValue(input, target);
    return true;
  }

  if (await selectYearThenMonth(target)) {
    ensureYearMonthValue(input, target);
    return true;
  }

  return false;
}

async function selectMonthFromYearMonthPanel(target: YearMonthTarget): Promise<boolean> {
  let panel = findYearMonthPanel();
  if (!panel) {
    return false;
  }

  // 年月弹层只能逐年切换，所以设置步数上限，避免页面异常时无限循环。
  for (let step = 0; step < 30; step += 1) {
    const currentYear = readPanelYear(panel);
    if (!currentYear || currentYear === target.year) {
      break;
    }

    const button = findYearStepButton(panel, target.year < currentYear ? -1 : 1);
    if (!button) {
      break;
    }

    clickElement(button);
    await waitForPageToSettle(120);
    panel = findYearMonthPanel() ?? panel;
  }

  if (readPanelYear(panel) !== target.year) {
    return false;
  }

  const monthCell = findMonthCell(panel, target.month);
  if (!monthCell) {
    return false;
  }

  clickElement(monthCell);
  await waitForPageToSettle(120);
  return true;
}

async function selectYearThenMonth(target: YearMonthTarget): Promise<boolean> {
  const yearPanel = findYearPanel();
  const yearCell = yearPanel ? findYearCell(yearPanel, target.year) : undefined;
  if (!yearCell) {
    return false;
  }

  clickElement(yearCell);
  await waitForPageToSettle(180);

  const monthPanel = findYearMonthPanel() ?? findMonthOnlyPanel();
  const monthCell = monthPanel ? findMonthCell(monthPanel, target.month) : undefined;
  if (!monthCell) {
    return false;
  }

  clickElement(monthCell);
  await waitForPageToSettle(120);
  return true;
}

function ensureYearMonthValue(
  input: HTMLInputElement | undefined,
  target: YearMonthTarget
): void {
  if (!input || input.value.trim()) {
    return;
  }
  setInputValue(input, formatYearMonth(target));
}

function formatYearMonth(target: YearMonthTarget): string {
  return `${target.year}-${String(target.month).padStart(2, "0")}`;
}

function parseYearMonth(value: string): YearMonthTarget | undefined {
  const text = value.trim();
  const match = text.match(/((?:19|20)\d{2})\D{0,4}(0?[1-9]|1[0-2])(?:\D|$)/);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return undefined;
  }
  return { year, month };
}

function findYearMonthPanel(): HTMLElement | undefined {
  // 通过“YYYY/ YYYY年 + 多个月份”识别年月选择器面板，兼容截图中标题只有“2026”的控件。
  const panels = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
    .filter((element) => isVisibleElement(element))
    .map((element) => ({
      element,
      text: compactText(element.textContent ?? "")
    }))
    .filter(({ text }) => {
      return hasYearText(text) && countMonthTexts(text) >= 6 && text.length <= 500;
    })
    .sort((a, b) => a.text.length - b.text.length);

  return panels[0]?.element;
}

function findMonthOnlyPanel(): HTMLElement | undefined {
  const panels = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
    .filter((element) => isVisibleElement(element))
    .map((element) => ({
      element,
      text: compactText(element.textContent ?? "")
    }))
    .filter(({ text }) => countMonthTexts(text) >= 6 && text.length <= 500)
    .sort((a, b) => a.text.length - b.text.length);

  return panels[0]?.element;
}

function findYearPanel(): HTMLElement | undefined {
  const panels = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
    .filter((element) => isVisibleElement(element))
    .map((element) => ({
      element,
      text: compactText(element.textContent ?? "")
    }))
    .filter(({ text }) => countYearTexts(text) >= 3 && countMonthTexts(text) < 6 && text.length <= 500)
    .sort((a, b) => a.text.length - b.text.length);

  return panels[0]?.element;
}

function countMonthTexts(text: string): number {
  return (text.match(/(?:^|\D)(?:0?[1-9]|1[0-2])月/g) ?? []).length;
}

function countYearTexts(text: string): number {
  return extractYearTexts(text).length;
}

function readPanelYear(panel: HTMLElement): number | undefined {
  return extractYearTexts(compactText(panel.textContent ?? ""))[0];
}

function hasYearText(text: string): boolean {
  return extractYearTexts(text).length > 0;
}

function extractYearTexts(text: string): number[] {
  const years: number[] = [];
  const regex = /(?:^|[^\d])((?:19|20)\d{2})(?:年|(?=$|[^\d]))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    years.push(Number(match[1]));
  }
  return years;
}

function findYearStepButton(panel: HTMLElement, direction: -1 | 1): HTMLElement | undefined {
  const candidates = Array.from(
    panel.querySelectorAll<HTMLElement>("button, [role='button'], a, span, div")
  ).filter((element) => isVisibleElement(element));
  const signal =
    direction < 0
      ? /«|‹|<|上一|上年|prev|previous|left|back/i
      : /»|›|>|下一|下年|next|right|forward/i;

  const textHit = candidates.find((element) => signal.test(buildElementSignalText(element)));
  if (textHit) {
    return textHit;
  }

  return findEdgeClickableInPanel(panel, candidates, direction);
}

function buildElementSignalText(element: HTMLElement): string {
  return compactText(
    `${element.textContent ?? ""} ${element.className || ""} ${
      element.getAttribute("aria-label") ?? ""
    } ${element.getAttribute("title") ?? ""}`
  );
}

function findEdgeClickableInPanel(
  panel: HTMLElement,
  candidates: HTMLElement[],
  direction: -1 | 1
): HTMLElement | undefined {
  // 有些年份箭头没有文字，只能根据面板顶部左右位置猜测上一年/下一年按钮。
  const panelRect = panel.getBoundingClientRect();
  const topLimit = panelRect.top + panelRect.height * 0.3;
  const topCandidates = candidates
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.top <= topLimit && rect.width > 0 && rect.height > 0)
    .sort((a, b) => (direction < 0 ? a.rect.left - b.rect.left : b.rect.right - a.rect.right));

  return topCandidates[0]?.element;
}

function findYearCell(panel: HTMLElement, year: number): HTMLElement | undefined {
  const cells = Array.from(
    panel.querySelectorAll<HTMLElement>("button, [role='button'], td, li, span, div")
  ).filter((element) => isVisibleElement(element));
  const cell = cells.find((element) => matchesYearText(element.textContent ?? "", year));
  if (!cell) {
    return undefined;
  }
  return cell.closest<HTMLElement>("button, [role='button'], td, li") ?? cell;
}

function matchesYearText(text: string, year: number): boolean {
  const normalized = compactText(text).replace(/\s+/g, "");
  return normalized === `${year}` || normalized === `${year}年`;
}

function findMonthCell(panel: HTMLElement, month: number): HTMLElement | undefined {
  const cells = Array.from(
    panel.querySelectorAll<HTMLElement>("button, [role='button'], td, li, span, div")
  ).filter((element) => isVisibleElement(element));
  const cell = cells.find((element) => matchesMonthText(element.textContent ?? "", month));
  if (!cell) {
    return undefined;
  }
  return cell.closest<HTMLElement>("button, [role='button'], td, li") ?? cell;
}

function matchesMonthText(text: string, month: number): boolean {
  const normalized = compactText(text).replace(/\s+/g, "");
  const match = normalized.match(/^(0?[1-9]|1[0-2])月?$/);
  return match ? Number(match[1]) === month : false;
}

function findMatchingPopupOption(targetValue: string): HTMLElement | undefined {
  const normalizedTarget = normalizeText(targetValue);
  if (!normalizedTarget) {
    return undefined;
  }
  const options = Array.from(document.querySelectorAll<HTMLElement>(POPUP_OPTION_SELECTOR))
    .filter((element) => isVisibleElement(element))
    .filter((element) => {
      const text = compactText(element.textContent ?? "");
      return text.length > 0 && text.length <= 80 && !/请选择|请输入/.test(text);
    });

  return (
    options.find((option) => normalizeText(option.textContent ?? "") === normalizedTarget) ??
    options.find((option) => {
      const optionText = normalizeText(option.textContent ?? "");
      return optionText.includes(normalizedTarget) || normalizedTarget.includes(optionText);
    })
  );
}

function shouldCheckChoice(element: HTMLInputElement, mapping: FieldMapping): boolean {
  const target = normalizeText(mapping.targetValue);
  const labelText = normalizeText(
    `${element.value} ${element.getAttribute("aria-label") ?? ""} ${
      element.closest("label")?.textContent ?? ""
    }`
  );

  if (["true", "yes", "是", "有"].includes(target)) {
    return true;
  }
  return Boolean(target) && (labelText.includes(target) || target.includes(labelText));
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  // React/Vue 受控输入框需要调用原生 value setter，否则只改 element.value 可能不触发框架状态。
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  element.focus();
  setNativeValue(element, value);
  dispatchInputLikeEvents(element, value);
  dispatchValueEvents(element);
}

function dispatchInputLikeEvents(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const InputEventConstructor = window.InputEvent;
  if (InputEventConstructor) {
    element.dispatchEvent(
      new InputEventConstructor("beforeinput", {
        bubbles: true,
        cancelable: true,
        data: value,
        inputType: "insertText"
      })
    );
  }
  element.dispatchEvent(new Event("keyup", { bubbles: true }));
}

function dispatchValueEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function dispatchMouseEvent(element: HTMLElement, type: string): void {
  const MouseEventConstructor = window.MouseEvent;
  element.dispatchEvent(
    new MouseEventConstructor(type, {
      bubbles: true,
      cancelable: true,
      view: window
    })
  );
}

function dispatchKeyboardEvent(element: HTMLElement, type: string, key: string): void {
  const KeyboardEventConstructor = window.KeyboardEvent;
  element.dispatchEvent(
    new KeyboardEventConstructor(type, {
      bubbles: true,
      cancelable: true,
      key,
      code: key === "Enter" ? "Enter" : key
    })
  );
}

function dispatchFocusEvent(element: HTMLElement, type: string, bubbles: boolean): void {
  const FocusEventConstructor = window.FocusEvent;
  if (FocusEventConstructor) {
    element.dispatchEvent(new FocusEventConstructor(type, { bubbles }));
    return;
  }
  element.dispatchEvent(new Event(type, { bubbles }));
}

function isVisibleElement(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function waitForPageToSettle(delay = 350): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delay);
  });
}
