console.log("Gemini Project Manager: Service Worker Loaded");

chrome.runtime.onInstalled.addListener(() => {
    console.log("Gemini Project Manager installed");
});

// Listen for History API changes (SPA navigation)
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    // Only care about Gemini URLs
    if (!details.url.includes('gemini.google.com')) return;

    console.log(`Gemini Project Manager: URL changed to ${details.url}`);

    // Message the content script to update its active chat state
    chrome.tabs.sendMessage(details.tabId, {
        type: 'URL_CHANGED',
        url: details.url
    }).catch(() => {
        // Content script might not be ready yet, ignore error
    });
}, {
    url: [{ hostContains: 'gemini.google.com' }]
});

// Also listen for regular navigation events
chrome.webNavigation.onCompleted.addListener((details) => {
    if (!details.url.includes('gemini.google.com')) return;

    chrome.tabs.sendMessage(details.tabId, {
        type: 'URL_CHANGED',
        url: details.url
    }).catch(() => {
        // Content script might not be ready yet, ignore error
    });
}, {
    url: [{ hostContains: 'gemini.google.com' }]
});
