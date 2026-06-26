import { RuntimeMessage } from "../shared/messages";

// 扩展首次安装后直接打开 options 页，让用户先录入本地简历模板。
chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// background 只处理跨页面的轻量消息；真正扫描和填写都放在 content script。
chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
