console.log("Gemini Project Manager: Service Worker Loaded");

chrome.runtime.onInstalled.addListener(() => {
    console.log("Gemini Project Manager installed");
});
