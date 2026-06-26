import { RuntimeMessage, ScanResponse } from "../shared/messages";
import { openPreviewPanel } from "./previewPanel";

// popup 有时会主动注入 content script。用页面级标记避免重复注册消息监听。
const BOOTSTRAP_KEY = "__resumeAutofillContentScriptLoaded";
const pageWindow = window as unknown as Record<string, boolean>;

if (!pageWindow[BOOTSTRAP_KEY]) {
  pageWindow[BOOTSTRAP_KEY] = true;

  // content script 的唯一入口：接到扫描消息后生成并打开预览面板。
  chrome.runtime.onMessage.addListener(
    (message: RuntimeMessage, _sender, sendResponse: (response: ScanResponse) => void) => {
      if (message.type !== "RESUME_AUTOFILL_SCAN") {
        return false;
      }

      void openPreviewPanel()
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) => {
          const messageText = error instanceof Error ? error.message : "扫描当前页面失败。";
          sendResponse({ ok: false, message: messageText });
        });

      return true;
    }
  );
}
