/**
 * 秋招画像 — 网申自动填充 Background Service Worker
 * 设计原则：最小化常驻逻辑。所有填充流程由 popup 按需驱动，
 * 这里只负责安装引导与消息兜底。
 */

// 安装后打开使用说明（首次安装）
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: 'https://github.com/yub369302-cyber/Recuritment-Portrait#网申自动填充插件'
    }).catch(() => { /* 离线/无权限时静默 */ });
  }
});

// 兜底：popup 关闭时页面主动请求填充（预留入口，M3 主站同步用）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PING') {
    sendResponse({ success: true, version: chrome.runtime.getManifest().version });
    return false;
  }
  return false;
});
