chrome.runtime.onInstalled.addListener(() => {
  console.log("Smart Inbox AI Extension Installed");
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "connectGmail") {
    console.log("Connecting Gmail...");

    // Open Gmail auth URL (your local backend route)
    chrome.tabs.create({ url: "http://localhost:3000/auth" }, (tab) => {
      console.log("Opened Gmail auth page:", tab.id);
    });
  }

  // When Gmail auth completes, the backend will redirect to /oauth2callback
  // This listener watches for that URL and then opens your dashboard.
  if (message.action === "checkForDashboard") {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.url && tab.url.includes("localhost:3000/oauth2callback")) {
          // Open dashboard after Gmail connection success
          chrome.tabs.create({ url: "http://localhost:3000" });
          sendResponse({ opened: true });
          return;
        }
      }
      sendResponse({ opened: false });
    });
    return true; // Keeps message channel open for async sendResponse
  }
});
