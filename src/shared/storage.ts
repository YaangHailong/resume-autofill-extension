import { createDefaultResumeProfile, normalizeResumeProfile } from "./resume";
import { AiMatchingSettings, ResumeProfile, UserMappingOverride } from "./types";

const STORAGE_KEYS = {
  aiSettings: "aiMatchingSettings",
  profile: "resumeProfile",
  overrides: "userMappingOverrides"
};

const OVERRIDE_LIMIT = 200;
export const DEFAULT_AI_MATCHING_ENDPOINT = "http://127.0.0.1:8787/api/resume-field-match";

// 所有用户简历数据都存在 chrome.storage.local，不经过后端。
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

// overrides 是用户在预览面板手动修正过的“简历字段 -> 网页字段”记忆。
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
  // 同一个网站同一个简历字段只保留最新选择，避免历史映射互相冲突。
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

export async function getAiMatchingSettings(): Promise<AiMatchingSettings> {
  const stored = await readStorage<{ aiMatchingSettings?: Partial<AiMatchingSettings> }>([
    STORAGE_KEYS.aiSettings
  ]);
  return normalizeAiMatchingSettings(stored.aiMatchingSettings);
}

export async function saveAiMatchingSettings(settings: AiMatchingSettings): Promise<void> {
  await writeStorage({
    [STORAGE_KEYS.aiSettings]: normalizeAiMatchingSettings(settings)
  });
}

function normalizeAiMatchingSettings(
  settings: Partial<AiMatchingSettings> | undefined
): AiMatchingSettings {
  return {
    enabled: Boolean(settings?.enabled),
    endpoint:
      typeof settings?.endpoint === "string" && settings.endpoint.trim().length > 0
        ? settings.endpoint.trim()
        : DEFAULT_AI_MATCHING_ENDPOINT
  };
}

function chromeStorageAvailable(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

async function readStorage<T>(keys: string[]): Promise<T> {
  // 非扩展环境下使用 localStorage，方便 Vite 页面调试和单元测试。
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
  // chrome.storage.local 是真实扩展运行时的持久化入口。
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
