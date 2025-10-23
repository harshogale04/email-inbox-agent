chrome.runtime.onInstalled.addListener(() => {
  console.log("Gemini Email Inbox Agent installed 🚀");
});

// Example background notification trigger (placeholder)
chrome.alarms.create("checkEmails", { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkEmails") {
    console.log("Checking for new urgent emails...");
    // You can call your backend endpoint here
  }
});
