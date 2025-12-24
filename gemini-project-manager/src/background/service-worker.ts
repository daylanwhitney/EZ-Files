console.log("Gemini Project Manager: Service Worker Loaded");

import { IndexingQueue } from './indexing-queue';
import { FolderChatService } from './chat-service';

const queue = new IndexingQueue();
const chatService = new FolderChatService();

chrome.runtime.onInstalled.addListener(() => {
    console.log("Gemini Project Manager installed");
});

// Unified message handler for all runtime messages
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    // Route BG_CHAT_RESPONSE_DONE to the chat service
    if (message.type === 'BG_CHAT_RESPONSE_DONE') {
        console.log("Service Worker: Received BG_CHAT_RESPONSE_DONE", {
            requestId: message.requestId,
            hasText: !!message.text,
            hasError: !!message.error
        });
        chatService.handleExternalResponse(message);
        return false; // No async response needed
    }
    
    // Route indexing commands to the queue
    if (message.type === 'CMD_INDEX_CHAT' && message.chatId) {
        queue.addToQueue(message.chatId, message.title);
        return false;
    }
    
    // ARCHIVE_COMPLETE is handled by IndexingQueue's own listener
    // Just log it here for debugging
    if (message.type === 'ARCHIVE_COMPLETE') {
        console.log("Service Worker: ARCHIVE_COMPLETE received for", message.chatId);
        return false;
    }
    
    // Route discovery complete (just log for now, migration happens in content script)
    if (message.type === 'DISCOVERY_COMPLETE') {
        console.log("Service Worker: Discovery complete", message);
        return false;
    }
    
    return false; // Default: no async response
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

// Clean up chat service windows when extension is suspended/reloaded
chrome.runtime.onSuspend?.addListener(() => {
    console.log("Service Worker: Suspending, cleaning up chat sessions");
    chatService.closeAllSessions();
});
