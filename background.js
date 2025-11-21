chrome.runtime.onInstalled.addListener(() => {
  console.info("Taboard extension installed.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ message: "Background script connection OK" });
  }

  if (message?.type === "NEW_TAB_READY") {
    sendResponse({
      greeting: "Set a focus goal each time you open a new tab!",
      timestamp: new Date().toISOString(),
    });
  }
});
