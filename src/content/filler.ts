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
  const result = fillPlan(refreshedPlan, skipPaths);

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

export function fillPlan(plan: FillPlan, skipPaths: string[] = []): FillResult {
  let filled = 0;
  let skipped = 0;
  const skipSet = new Set(skipPaths);

  plan.mappings.forEach((mapping) => {
    if (skipSet.has(mapping.resumePath) || mapping.status === "unmatched" || !mapping.selector) {
      skipped += 1;
      return;
    }

    const element = queryAutofillElement(mapping.selector);
    if (!element) {
      skipped += 1;
      return;
    }

    if (fillElement(element, mapping)) {
      filled += 1;
    } else {
      skipped += 1;
    }
  });

  return { filled, skipped, addedSections: 0 };
}

export function fillElement(element: HTMLElement, mapping: FieldMapping): boolean {
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
    setNativeValue(element, targetValue);
    dispatchValueEvents(element);
    return true;
  }

  if (element instanceof HTMLTextAreaElement) {
    setNativeValue(element, targetValue);
    dispatchValueEvents(element);
    return true;
  }

  if (element.isContentEditable || element.getAttribute("role") === "textbox") {
    element.textContent = targetValue;
    dispatchValueEvents(element);
    return true;
  }

  return false;
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

function dispatchValueEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function waitForPageToSettle(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 350);
  });
}

