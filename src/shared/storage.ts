import { createDefaultResumeProfile, normalizeResumeProfile } from "./resume";
import { ResumeProfile, UserMappingOverride } from "./types";

const STORAGE_KEYS = {
  profile: "resumeProfile",
  overrides: "userMappingOverrides"
};

const OVERRIDE_LIMIT = 200;

export async function getResumeProfile(): Promise<ResumeProfile> {
  const stored = await readStorage<{ resumeProfile?: Partial<ResumeProfile> }>([
    STORAGE_KEYS.profile
  ]);
  return normalizeResumeProfile(stored.resumeProfile ?? createDefaultResumeProfile());
}

export async function saveResumeProfile(profile: ResumeProfile): Promise<void> {
  await writeStorage({
    [STORAGE_KEYS.profile]: {
      ...profile,
      updatedAt: new Date().toISOString()
    }
  });
}

export async function getMappingOverrides(): Promise<UserMappingOverride[]> {
  const stored = await readStorage<{ userMappingOverrides?: UserMappingOverride[] }>([
    STORAGE_KEYS.overrides
  ]);
  return Array.isArray(stored.userMappingOverrides) ? stored.userMappingOverrides : [];
}

export async function saveMappingOverrides(overrides: UserMappingOverride[]): Promise<void> {
  await writeStorage({
    [STORAGE_KEYS.overrides]: overrides
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, OVERRIDE_LIMIT)
  });
}

export async function upsertMappingOverrides(
  nextOverrides: UserMappingOverride[]
): Promise<void> {
  const existing = await getMappingOverrides();
  const merged = [...nextOverrides, ...existing].reduce<UserMappingOverride[]>((items, item) => {
    const duplicateIndex = items.findIndex(
      (candidate) =>
        candidate.origin === item.origin && candidate.resumePath === item.resumePath
    );
    if (duplicateIndex >= 0) {
      items[duplicateIndex] = item;
    } else {
      items.push(item);
    }
    return items;
  }, []);
  await saveMappingOverrides(merged);
}

function chromeStorageAvailable(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

async function readStorage<T>(keys: string[]): Promise<T> {
  if (!chromeStorageAvailable()) {
    const result: Record<string, unknown> = {};
    keys.forEach((key) => {
      const raw = window.localStorage.getItem(key);
      result[key] = raw ? JSON.parse(raw) : undefined;
    });
    return result as T;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items as T));
  });
}

async function writeStorage(items: Record<string, unknown>): Promise<void> {
  if (!chromeStorageAvailable()) {
    Object.entries(items).forEach(([key, value]) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    });
    return;
  }

  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

