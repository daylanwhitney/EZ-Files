console.log("Gemini Project Manager: Service Worker Loaded");

import { IndexingQueue } from './indexing-queue';
import { FolderChatService } from './chat-service';

const queue = new IndexingQueue();
const chatService = new FolderChatService();

// Track side panel open state per window
const panelOpenState: Map<number, boolean> = new Map();

// Track reference panel popup window
let referencePanelWindowId: number | null = null;

// Function to open/focus reference panel
async function openReferencePanel() {
    // If window exists, focus it
    if (referencePanelWindowId !== null) {
        try {
            const existingWindow = await chrome.windows.get(referencePanelWindowId);
            if (existingWindow) {
                await chrome.windows.update(referencePanelWindowId, { focused: true });
                console.log("Service Worker: Focused existing reference panel window");
                return;
            }
        } catch (err) {
            // Window doesn't exist anymore, reset
            referencePanelWindowId = null;
        }
    }

    // Create new popup window
    try {
        const newWindow = await chrome.windows.create({
            url: 'referencepanel.html',
            type: 'popup',
            width: 450,
            height: 650,
            // Note: left/top omitted to let Chrome position it naturally
            // (screen object not available in service workers)
            focused: true
        });

        if (newWindow?.id) {
            referencePanelWindowId = newWindow.id;
            console.log("Service Worker: Created reference panel window", referencePanelWindowId);
        }
    } catch (err) {
        console.error("Service Worker: Failed to create reference panel window", err);
    }
}

// Listen for reference panel window close
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === referencePanelWindowId) {
        referencePanelWindowId = null;
        console.log("Service Worker: Reference panel window closed");
    }
});

// Helper to check if panel is open for a window
function isPanelOpen(windowId: number): boolean {
    return panelOpenState.get(windowId) || false;
}

// Listen for panel open/close events to track state
if (chrome.sidePanel) {
    // @ts-ignore - onOpened may not be in older type definitions
    chrome.sidePanel.onOpened?.addListener((info: { windowId: number }) => {
        panelOpenState.set(info.windowId, true);
        console.log("Service Worker: Panel opened for window", info.windowId);
    });

    // @ts-ignore - onClosed may not be in older type definitions  
    chrome.sidePanel.onClosed?.addListener((info: { windowId: number }) => {
        panelOpenState.set(info.windowId, false);
        console.log("Service Worker: Panel closed for window", info.windowId);
    });
}

// Enable Side Panel to open on icon click
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error(error));
}

chrome.runtime.onInstalled.addListener(() => {
    console.log("Gemini Project Manager: Installed");
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

    // Handle CMD_TOGGLE_SIDE_PANEL from content script (toggle open/close)
    // IMPORTANT: Must use sender.tab directly to maintain user gesture context
    if (message.type === 'CMD_OPEN_SIDE_PANEL' || message.type === 'CMD_TOGGLE_SIDE_PANEL') {
        const tabId = _sender.tab?.id;
        const windowId = _sender.tab?.windowId;

        if (!tabId || !windowId) {
            console.error("Service Worker: No tab info available for side panel toggle");
            return false;
        }

        // Check if panel is currently open
        const isOpen = isPanelOpen(windowId);

        if (isOpen) {
            // Close the panel
            // @ts-ignore - close method may not be in older type definitions
            chrome.sidePanel.close({ windowId }).then(() => {
                console.log("Service Worker: Closed side panel");
            }).catch((err: Error) => {
                console.error("Service Worker: Failed to close side panel", err);
            });
        } else {
            // Open the panel - must be synchronous to preserve user gesture
            chrome.sidePanel.open({ tabId }).then(() => {
                console.log("Service Worker: Opened side panel");
            }).catch((err: Error) => {
                console.error("Service Worker: Failed to open side panel", err);
            });
        }
        return false;
    }

    // Handle CMD_OPEN_REFERENCE_PANEL - opens as a separate popup window
    if (message.type === 'CMD_OPEN_REFERENCE_PANEL') {
        openReferencePanel();
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
