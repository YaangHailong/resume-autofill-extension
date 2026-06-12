import { useEffect, useMemo, useState } from "react";
import { RuntimeMessage, ScanResponse } from "../shared/messages";
import { flattenResumeProfile, isProfileEffectivelyEmpty } from "../shared/resume";
import { getResumeProfile } from "../shared/storage";
import { ResumeProfile } from "../shared/types";

type Status = "idle" | "scanning" | "success" | "error";

export default function App(): JSX.Element {
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("打开网页后点击扫描，先预览再填写。");
  const [tabUrl, setTabUrl] = useState("");

  const fieldCount = useMemo(
    () => (profile ? flattenResumeProfile(profile).length : 0),
    [profile]
  );

  useEffect(() => {
    void getResumeProfile().then(setProfile);
    void getActiveTab().then((tab) => setTabUrl(tab?.url ?? ""));
  }, []);

  async function scanCurrentPage(): Promise<void> {
    setStatus("scanning");
    setMessage("正在扫描当前页面...");

    try {
      const tab = await getActiveTab();
      if (!tab?.id) {
        throw new Error("没有找到当前标签页。");
      }
      ensurePageCanReceiveContentScript(tab.url ?? "");

      const response = await sendScanMessage(tab.id);
      if (!response.ok) {
        throw new Error(response.message ?? "扫描失败。");
      }
      setStatus("success");
      setMessage("预览面板已打开，请在网页右上角确认填写。");
    } catch (error) {
      const text = error instanceof Error ? error.message : "扫描失败。";
      setStatus("error");
      setMessage(text);
    }
  }

  function openOptions(): void {
    chrome.runtime.sendMessage<RuntimeMessage>({ type: "OPEN_OPTIONS" });
  }

  const emptyProfile = profile ? isProfileEffectivelyEmpty(profile) : true;

  return (
    <main className="popupShell">
      <header>
        <div>
          <p className="eyebrow">Resume Autofill</p>
          <h1>简历自动填写</h1>
        </div>
      </header>

      <section className="statusBox">
        <strong>{fieldCount}</strong>
        <span>当前模板可填写字段</span>
      </section>

      <p className={`message ${status}`}>{message}</p>

      {tabUrl.startsWith("chrome://") && (
        <p className="message error">Chrome 内置页面不允许内容脚本运行，请切换到普通网页。</p>
      )}

      {emptyProfile && (
        <p className="message warning">模板里还没有可填写内容，建议先打开模板填写简历。</p>
      )}

      <div className="actions">
        <button
          className="primaryButton"
          type="button"
          onClick={scanCurrentPage}
          disabled={status === "scanning" || emptyProfile}
        >
          {status === "scanning" ? "扫描中..." : "扫描当前页"}
        </button>
        <button className="secondaryButton" type="button" onClick={openOptions}>
          打开模板
        </button>
      </div>
    </main>
  );
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

async function sendTabMessage(
  tabId: number,
  message: RuntimeMessage
): Promise<ScanResponse> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: ScanResponse | undefined) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response ?? { ok: false, message: "内容脚本没有响应。" });
    });
  });
}

async function sendScanMessage(tabId: number): Promise<ScanResponse> {
  const message: RuntimeMessage = { type: "RESUME_AUTOFILL_SCAN" };
  try {
    return await sendTabMessage(tabId, message);
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      throw error;
    }
  }

  await injectContentScript(tabId);
  return sendTabMessage(tabId, message);
}

async function injectContentScript(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["assets/content.js"]
      },
      () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(toFriendlyInjectionError(error.message)));
          return;
        }
        resolve();
      }
    );
  });
}

function ensurePageCanReceiveContentScript(url: string): void {
  if (/^(chrome|edge|about|devtools|chrome-extension):\/\//i.test(url)) {
    throw new Error("当前页面不允许注入扩展脚本，请切换到普通 http/https 网页后再扫描。");
  }
}

function isMissingContentScriptError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Receiving end does not exist") ||
    message.includes("Could not establish connection")
  );
}

function toFriendlyInjectionError(message: string | undefined): string {
  const text = message ?? "无法注入内容脚本。";
  if (/file:\/\//i.test(text) || text.includes("Cannot access contents of url")) {
    return "无法注入当前页面。如果你打开的是本地 file:// 文件，请到 chrome://extensions 的扩展详情里开启“允许访问文件网址”，或改用 http/https 页面测试。";
  }
  return `无法注入内容脚本：${text}`;
}
