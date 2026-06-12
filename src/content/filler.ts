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

  openCustomControl(root, element);
  await waitForPageToSettle(120);

  if (await selectYearMonthFromPopup(mapping.targetValue)) {
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

function openCustomControl(root: HTMLElement, element: HTMLInputElement): void {
  element.focus();
  clickElement(root);
  clickElement(element);
}

function clickElement(element: HTMLElement): void {
  dispatchMouseEvent(element, "mousedown");
  dispatchMouseEvent(element, "mouseup");
  element.click();
}

async function selectYearMonthFromPopup(targetValue: string): Promise<boolean> {
  const target = parseYearMonth(targetValue);
  if (!target) {
    return false;
  }

  let panel = findYearMonthPanel();
  if (!panel) {
    return false;
  }

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
  const panels = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
    .filter((element) => isVisibleElement(element))
    .map((element) => ({
      element,
      text: compactText(element.textContent ?? "")
    }))
    .filter(({ text }) => {
      const monthCount = (text.match(/(?:^|\D)(?:0?[1-9]|1[0-2])月/g) ?? []).length;
      return /(?:19|20)\d{2}年/.test(text) && monthCount >= 6 && text.length <= 500;
    })
    .sort((a, b) => a.text.length - b.text.length);

  return panels[0]?.element;
}

function readPanelYear(panel: HTMLElement): number | undefined {
  const match = compactText(panel.textContent ?? "").match(/((?:19|20)\d{2})年/);
  return match ? Number(match[1]) : undefined;
}

function findYearStepButton(panel: HTMLElement, direction: -1 | 1): HTMLElement | undefined {
  const candidates = Array.from(
    panel.querySelectorAll<HTMLElement>("button, [role='button'], a, span, div")
  ).filter((element) => isVisibleElement(element));
  const signal = direction < 0 ? /«|‹|<|上一|上年|prev|previous|left/i : /»|›|>|下一|下年|next|right/i;

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
  const panelRect = panel.getBoundingClientRect();
  const topLimit = panelRect.top + panelRect.height * 0.3;
  const topCandidates = candidates
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.top <= topLimit && rect.width > 0 && rect.height > 0)
    .sort((a, b) => (direction < 0 ? a.rect.left - b.rect.left : b.rect.right - a.rect.right));

  return topCandidates[0]?.element;
}

function findMonthCell(panel: HTMLElement, month: number): HTMLElement | undefined {
  const monthText = `${month}月`;
  const cells = Array.from(
    panel.querySelectorAll<HTMLElement>("button, [role='button'], td, li, span, div")
  ).filter((element) => isVisibleElement(element));
  const cell = cells.find((element) => compactText(element.textContent ?? "") === monthText);
  if (!cell) {
    return undefined;
  }
  return cell.closest<HTMLElement>("button, [role='button'], td, li") ?? cell;
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
