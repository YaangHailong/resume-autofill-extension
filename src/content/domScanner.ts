import { sectionForText } from "../shared/fieldDictionary";
import { AddButtonCandidate, FieldCandidate, FieldKind } from "../shared/types";

// 扫描所有第一版支持的可填写控件；排除提交、重置、隐藏和文件上传。
const FIELD_SELECTOR = [
  "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='file'])",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']"
].join(",");

// 动态添加按钮可能不是 button，新东方页面里就会出现 id 带 addButton 的 div。
const ADD_BUTTON_SELECTOR = [
  "button",
  "a",
  "[role='button']",
  "input[type='button']",
  "input[type='submit']",
  "[id$='_addButton']",
  "[id*='addButton']"
].join(",");

const FIELD_ID_ATTR = "data-resume-autofill-field";
const BUTTON_ID_ATTR = "data-resume-autofill-button";

// 把真实 DOM 控件转成 FieldCandidate，后续 matcher 只依赖这份结构化信息。
export function scanPageFields(root: ParentNode = document): FieldCandidate[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(
    isVisibleElement
  );

  return elements.map((element, index) => {
    const id = ensureDataId(element, FIELD_ID_ATTR, `field-${index}`);
    const labelText = findLabelText(element);
    const placeholder = getAttribute(element, "placeholder");
    const name = getAttribute(element, "name");
    const idAttr = getAttribute(element, "id");
    const ariaLabel = getAttribute(element, "aria-label");
    const contextText = collectContextText(element);
    const sectionHint = inferNearestSectionHint(element, labelText, placeholder, contextText);

    return {
      id,
      selector: `[${FIELD_ID_ATTR}="${id}"]`,
      tagName: element.tagName.toLowerCase(),
      kind: detectFieldKind(element),
      inputType: element instanceof HTMLInputElement ? element.type : "",
      labelText,
      placeholder,
      name,
      idAttr,
      ariaLabel,
      contextText,
      value: readElementValue(element),
      options: readOptions(element),
      sectionHint
    };
  });
}

// 扫描“添加教育/工作/语言”等按钮。这里故意收紧规则，避免把备案/隐私链接点掉。
export function scanAddButtons(root: ParentNode = document): AddButtonCandidate[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(ADD_BUTTON_SELECTOR)).filter(
    (element) => isVisibleElement(element) && !isDisabled(element)
  );

  return elements
    .map((element, index) => {
      const text = getButtonText(element);
      const contextText = collectContextText(element);
      const ownSignalText = compactText(
        `${text} ${getAttribute(element, "id")} ${getAttribute(element, "name")} ${
          element.className || ""
        } ${getAttribute(element, "aria-label")} ${getAttribute(element, "title")}`
      );
      const looksLikeAdd =
        /添加|新增|增加|add|new|append|create/i.test(ownSignalText) &&
        !/submit|提交|保存|下一步|next|取消|暂存|备案|隐私|privacy|beian/i.test(text);

      if (!looksLikeAdd) {
        return undefined;
      }

      const id = ensureDataId(element, BUTTON_ID_ATTR, `button-${index}`);
      return {
        id,
        selector: `[${BUTTON_ID_ATTR}="${id}"]`,
        text,
        contextText
      };
    })
    .filter((item): item is AddButtonCandidate => Boolean(item));
}

// 填写阶段通过扫描时写入的 data 属性重新定位元素，避免复杂 CSS selector 不稳定。
export function queryAutofillElement(selector: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(selector);
}

// 优先使用语义明确的控件类型，matcher 会据此给 email、phone、date 等字段加分。
function detectFieldKind(element: HTMLElement): FieldKind {
  if (element instanceof HTMLTextAreaElement) {
    return "textarea";
  }
  if (element instanceof HTMLSelectElement) {
    return "select";
  }
  if (element.isContentEditable || element.getAttribute("role") === "textbox") {
    return "contenteditable";
  }
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    if (type === "email") {
      return "email";
    }
    if (type === "tel") {
      return "tel";
    }
    if (type === "url") {
      return "url";
    }
    if (type === "number") {
      return "number";
    }
    if (type === "date" || type === "month") {
      return "date";
    }
    if (type === "checkbox") {
      return "checkbox";
    }
    if (type === "radio") {
      return "radio";
    }
    return "text";
  }
  return "unknown";
}

function findLabelText(element: HTMLElement): string {
  // 标准 label[for] 是最可靠的 label 来源。
  const id = element.getAttribute("id");
  if (id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${cssEscape(id)}"]`);
    if (label?.textContent) {
      return compactText(label.textContent);
    }
  }

  const wrappingLabel = element.closest("label");
  if (wrappingLabel?.textContent) {
    return compactText(wrappingLabel.textContent);
  }

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((labelId) => document.getElementById(labelId)?.textContent ?? "")
      .join(" ");
    if (text.trim()) {
      return cleanLabelText(text);
    }
  }

  const formItemText = findFormItemLabelText(element);
  if (formItemText) {
    return formItemText;
  }

  return findNearbyLabelText(element);
}

// 上下文文本用于兜底匹配，但限制深度和长度，避免页脚/导航污染匹配结果。
function collectContextText(element: HTMLElement): string {
  const pieces: string[] = [];
  let current: HTMLElement | null = element.parentElement;
  let depth = 0;

  while (current && depth < 3) {
    pieces.push(current.textContent ?? "");
    current = current.parentElement;
    depth += 1;
  }

  return compactText(pieces.join(" ")).slice(0, 500);
}

function inferNearestSectionHint(
  element: HTMLElement,
  labelText: string,
  placeholder: string,
  contextText: string
): FieldCandidate["sectionHint"] {
  return (
    findNearestSectionHint(element) ??
    sectionForText(`${labelText} ${placeholder} ${contextText}`)
  );
}

function findNearestSectionHint(element: HTMLElement): FieldCandidate["sectionHint"] {
  let current: HTMLElement = element;
  let parent = element.parentElement;
  let depth = 0;

  while (parent && depth < 10) {
    const siblingHint = findPreviousSiblingSectionHint(current);
    if (siblingHint) {
      return siblingHint;
    }

    const parentHint = sectionForText(buildContainerSectionSignal(parent));
    if (parentHint) {
      return parentHint;
    }

    current = parent;
    parent = parent.parentElement;
    depth += 1;
  }

  return undefined;
}

function buildContainerSectionSignal(container: HTMLElement): string {
  const parts = [
    getAttribute(container, "aria-label"),
    getAttribute(container, "title"),
    getAttribute(container, "data-section"),
    getAttribute(container, "data-name"),
    container.id,
    String(container.className || "")
  ];

  const legend = Array.from(container.children).find(
    (child) => child.tagName.toLowerCase() === "legend"
  ) as HTMLElement | undefined;
  if (legend) {
    parts.push(extractStaticText(legend));
  }

  const heading = Array.from(container.children).find((child) =>
    /^h[1-6]$/i.test(child.tagName)
  ) as HTMLElement | undefined;
  if (heading) {
    parts.push(extractStaticText(heading));
  }

  return compactText(parts.join(" "));
}

function findPreviousSiblingSectionHint(reference: HTMLElement): FieldCandidate["sectionHint"] {
  let sibling = reference.previousElementSibling as HTMLElement | null;
  let checked = 0;

  while (sibling && checked < 16) {
    const hint = findSectionHintInside(sibling);
    if (hint) {
      return hint;
    }
    sibling = sibling.previousElementSibling as HTMLElement | null;
    checked += 1;
  }

  return undefined;
}

function findSectionHintInside(element: HTMLElement): FieldCandidate["sectionHint"] {
  const selfHint = sectionForText(
    compactText(
      [
        extractStaticText(element),
        getAttribute(element, "aria-label"),
        getAttribute(element, "title"),
        getAttribute(element, "data-section"),
        getAttribute(element, "data-name"),
        element.id,
        String(element.className || "")
      ].join(" ")
    )
  );
  if (selfHint) {
    return selfHint;
  }

  const sectionTextElements = Array.from(
    element.querySelectorAll<HTMLElement>(
      [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "legend",
        "[class*='title']",
        "[class*='header']",
        "[class*='section']"
      ].join(",")
    )
  ).reverse();

  for (const candidate of sectionTextElements) {
    const hint = sectionForText(extractStaticText(candidate));
    if (hint) {
      return hint;
    }
  }

  return undefined;
}

function readElementValue(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") {
      return element.checked ? element.value : "";
    }
    return element.value;
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.value;
  }
  return element.textContent ?? "";
}

function readOptions(element: HTMLElement): string[] {
  if (!(element instanceof HTMLSelectElement)) {
    return [];
  }
  return Array.from(element.options).map((option) => option.textContent?.trim() || option.value);
}

function getButtonText(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    return compactText(element.value || element.getAttribute("aria-label") || "");
  }
  return compactText(
    `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${
      element.getAttribute("title") ?? ""
    }`
  );
}

function findFormItemLabelText(element: HTMLElement): string {
  // 新东方等组件化表单常用 .form-item__text 存 label，而不是原生 label[for]。
  const formItem = element.closest(".form-item");
  const label = formItem?.querySelector<HTMLElement>(".form-item__text, label");
  return label ? cleanLabelText(label.textContent ?? "") : "";
}

function findNearbyLabelText(element: HTMLElement): string {
  let current: HTMLElement = element;
  let parent = element.parentElement;
  let depth = 0;

  while (parent && depth < 8) {
    const siblings = Array.from(parent.children) as HTMLElement[];
    const currentIndex = siblings.indexOf(current);

    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const text = extractStaticText(siblings[index]);
      if (text) {
        return text;
      }
    }

    current = parent;
    parent = parent.parentElement;
    depth += 1;
  }

  return "";
}

function extractStaticText(element: HTMLElement): string {
  // 克隆后移除控件和按钮，只保留静态说明文字作为候选 label。
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`${FIELD_SELECTOR}, ${ADD_BUTTON_SELECTOR}`).forEach((child) => {
    child.remove();
  });
  const text = cleanLabelText(clone.textContent ?? "");
  if (!text || text.length > 80) {
    return "";
  }
  if (/保存|提交|下一步|取消|请输入|请选择/i.test(text)) {
    return "";
  }
  return text;
}

function ensureDataId(element: HTMLElement, attr: string, fallback: string): string {
  // 给页面元素打临时标记，预览面板里的 selector 才能稳定回指到同一个控件。
  const existing = element.getAttribute(attr);
  if (existing) {
    return existing;
  }
  const id = `${fallback}-${Math.random().toString(36).slice(2, 8)}`;
  element.setAttribute(attr, id);
  return id;
}

function getAttribute(element: HTMLElement, name: string): string {
  return element.getAttribute(name)?.trim() ?? "";
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

function isDisabled(element: HTMLElement): boolean {
  return (
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true" ||
    (element instanceof HTMLButtonElement && element.disabled) ||
    (element instanceof HTMLInputElement && element.disabled)
  );
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cleanLabelText(text: string): string {
  return compactText(text)
    .replace(/[：:*＊]+$/g, "")
    .trim();
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}
