chrome.runtime.onInstalled.addListener(() => {
  console.info("Taboard extension installed.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ message: "배경 스크립트 연결 OK" });
  }

  if (message?.type === "NEW_TAB_READY") {
    sendResponse({
      greeting: "새 탭을 열 때마다 집중할 목표를 정해보세요!",
      timestamp: new Date().toISOString(),
    });
  }
});
