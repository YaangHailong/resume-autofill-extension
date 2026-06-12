import { sectionForText } from "../shared/fieldDictionary";
import { AddButtonCandidate, FieldCandidate, FieldKind } from "../shared/types";

const FIELD_SELECTOR = [
  "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='file'])",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']"
].join(",");

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
      sectionHint: sectionForText(`${labelText} ${placeholder} ${contextText}`)
    };
  });
}

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

export function queryAutofillElement(selector: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(selector);
}

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
