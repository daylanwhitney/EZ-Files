import React from 'react';
import { createRoot } from 'react-dom/client';
import Sidebar from '../components/Sidebar';
import styleText from '../index.css?inline';

console.log("Gemini Project Manager: Content Script Loaded");

const ROOT_ID = 'gemini-project-manager-root';

// Helper to check if extension context is still valid
function isExtensionContextValid(): boolean {
    try {
        // This will throw if context is invalidated
        return !!chrome.runtime?.id;
    } catch {
        return false;
    }
}

// Safe wrapper for chrome.runtime.sendMessage
function safeSendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
        if (!isExtensionContextValid()) {
            console.warn("Gemini Project Manager: Extension context invalidated, skipping message");
            reject(new Error("Extension context invalidated"));
            return;
        }
        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}

// SVG for the Projects folder icon
const FOLDER_ICON = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M20 4H12L10 2H4C2.9 2 2.01 2.9 2.01 4L2 20C2 21.1 2.9 22 4 22H20C21.1 22 22 21.1 22 20V6C22 4.9 21.1 4 20 4ZM20 20H4V6H20V20Z" />
</svg>
`;

function createSidebarButton(isFallback = false) {
    const button = document.createElement('div');
    button.className = "ez-projects-btn";

    if (isFallback) {
        // Floating button style if sidebar isn't found
        button.style.cssText = `
            position: fixed;
            top: 80px;
            left: 20px;
            z-index: 9998;
            background-color: #1e1f20;
            color: #e3e3e3;
            border-radius: 50%;
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: transform 0.2s;
            border: 1px solid #444746;
        `;
        button.innerHTML = FOLDER_ICON;
        button.title = "Projects (Fallback Mode)";
    } else {
        // Native sidebar style
        button.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 16px;
            margin: 4px 0;
            cursor: pointer;
            border-radius: 9999px;
            color: #e3e3e3;
            font-family: 'Google Sans', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
        `;
        button.innerHTML = `
            <span style="display: flex; align-items: center; justify-content: center;">${FOLDER_ICON}</span>
            <span style="flex: 1;">Projects</span>
        `;
        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        });
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = 'transparent';
        });
    }

    button.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('ez-files-toggle'));
    });

    return button;
}

import { deepQuerySelectorAll, getParents, scrapeChatContent, findChatElement } from '../utils/dom';

// Keep track of retry attempts to trigger fallback
let retryCount = 0;
const MAX_RETRIES = 20; // 20 attempts * 500ms debounce ~= 10 seconds before fallback

// Helper to find the sidebar container
function findSidebarContainer(): HTMLElement | null {
    // Strategy: Find "New Chat" and "Chats" (or "Recent") to define the sidebar bounds
    // CRITICAL: Must use deep search because these might be inside Shadow DOM
    const allSpans = deepQuerySelectorAll(document.body, 'span');

    // 1. Find anchor points
    const newChatSpan = allSpans.find(el => el.textContent?.trim() === 'New chat' || el.textContent?.trim() === 'New Chat');
    const chatsSpan = allSpans.find(el => el.textContent?.trim() === 'Chats' || el.textContent?.trim() === 'Recent');
    const recentSpan = allSpans.find(el => el.textContent?.trim() === 'Recent');

    let targetContainer: HTMLElement | null = null;

    // 2. Identify likely sidebar container using Least Common Ancestor (LCA)
    if (newChatSpan && (chatsSpan || recentSpan)) {
        const otherSpan = chatsSpan || recentSpan;
        const parents1 = getParents(newChatSpan!);
        const parents2 = getParents(otherSpan!);

        // Find the first common parent
        targetContainer = parents1.find(p => parents2.includes(p)) || null;
    }

    // Fallback if LCA failed: try to find container of New Chat alone
    if (!targetContainer && newChatSpan) {
        // Go up 3-4 levels, looking for a flex col
        let curr = newChatSpan.parentElement;
        for (let i = 0; i < 5; i++) {
            if (curr && window.getComputedStyle(curr).display === 'flex' && window.getComputedStyle(curr).flexDirection === 'column') {
                targetContainer = curr;
                break;
            }
            curr = curr?.parentElement || null;
        }
    }

    // Strategy 3: Main nav selector fallback
    if (!targetContainer) {
        targetContainer = document.querySelector('nav') || null;
    }

    return targetContainer;
}
function findAndInjectButton() {
    // Check if we already injected
    if (document.querySelector('.ez-projects-btn')) return;

    let targetContainer = findSidebarContainer();

    if (targetContainer) {
        // Strategy: Try to find a reference element to copy styles from
        // We prefer 'New chat' as it's the primary main button usually
        const newChatSpan = Array.from(document.querySelectorAll('span')).find(el => el.textContent?.trim() === 'New chat' || el.textContent?.trim() === 'New Chat');
        let referenceEl = newChatSpan ? newChatSpan.closest('div[role="button"]') || newChatSpan.parentElement : null;

        // If we can't find New Chat button specifically, try to use the first child of the container
        if (!referenceEl && targetContainer.children.length > 0) {
            referenceEl = targetContainer.children[0] as HTMLElement;
        }

        const btn = createSidebarButton(false);

        // Apply dynamic styles if reference element exists
        if (referenceEl instanceof HTMLElement) {
            const style = window.getComputedStyle(referenceEl);

            // Copy key layout properties
            btn.style.paddingLeft = style.paddingLeft;
            btn.style.paddingRight = style.paddingRight; // Keep symmetry
            btn.style.marginLeft = style.marginLeft;
            btn.style.marginRight = style.marginRight;
            btn.style.width = style.width !== 'auto' ? style.width : '100%'; // Often width is 100% or fixed

            // If padding is 0, it might be on the inner container, so let's default to at least our base if 0
            if (parseFloat(style.paddingLeft) < 4) {
                // Keep our default or try to go one level deep? 
                // For reset safety:
                btn.style.paddingLeft = '16px';
            }

            console.log("Gemini Project Manager: Copied styles from", referenceEl);
        } else {
            // Fallback if no reference: Increase default padding
            btn.style.paddingLeft = '24px';
            btn.style.marginLeft = '8px';
        }

        let inserted = false;

        // Insertion Logic: We want to insert BEFORE the "Chats" section.
        // We need to find the child of targetContainer that *contains* the existing chatsSpan.
        const spanElements = Array.from(targetContainer.querySelectorAll('span'));
        const chatsSpan = spanElements.find(el => el.textContent?.trim() === 'Chats' || el.textContent?.trim() === 'Recent');

        if (chatsSpan) {
            let current = chatsSpan;
            while (current && current.parentElement !== targetContainer) {
                current = current.parentElement!;
            }

            if (current && current.parentElement === targetContainer) {
                targetContainer.insertBefore(btn, current);
                inserted = true;
                console.log("Gemini Project Manager: Inserted before Chats/Recent block");
            }
        }

        // If "Chats" not found or insertion failed, try "Gems"
        if (!inserted) {
            const gemsSpan = spanElements.find(el => el.textContent?.trim() === 'Gems');
            if (gemsSpan) {
                let current = gemsSpan;
                while (current && current.parentElement !== targetContainer) {
                    current = current.parentElement!;
                }

                if (current && current.parentElement === targetContainer) {
                    // Insert AFTER Gems
                    if (current.nextSibling) {
                        targetContainer.insertBefore(btn, current.nextSibling);
                    } else {
                        targetContainer.appendChild(btn);
                    }
                    inserted = true;
                    console.log("Gemini Project Manager: Inserted after Gems block");
                }
            }
        }

        // Final Fallback: Insert at reasonably standard position (e.g. index 2 or 3)
        if (!inserted) {
            if (targetContainer.children.length > 2) {
                targetContainer.insertBefore(btn, targetContainer.children[2]);
            } else {
                targetContainer.appendChild(btn);
            }
            console.log("Gemini Project Manager: Inserted at index 2 (fallback)");
        }

    } else {
        retryCount++;

        if (retryCount >= MAX_RETRIES) {
            console.log("Gemini Project Manager: Max retries reached. Injecting fallback floating button.");
            const fallbackBtn = createSidebarButton(true);
            document.body.appendChild(fallbackBtn);
        }
    }
}

// Helper to make existing chats draggable
function makeChatsDraggable() {
    console.log("Gemini Project Manager: makeChatsDraggable - Searching for chat elements...");

    const chatElements: HTMLElement[] = [];

    // STRATEGY 1: Target the conversation row containers (ORIGINAL - this works)
    const conversationRows = document.querySelectorAll('[class*="conversation-item"]:not([class*="conversation-actions"])');

    conversationRows.forEach((row) => {
        const htmlRow = row as HTMLElement;

        // Skip if already processed
        if (htmlRow.getAttribute('data-ez-draggable') === 'true') return;

        // Must have text content (the chat title)
        const text = htmlRow.textContent?.trim() || '';
        if (text.length === 0) return;

        // Skip if it's just an empty container
        if (htmlRow.children.length === 0) return;

        console.log(`  Found conversation row: "${text.substring(0, 40)}..."`);
        chatElements.push(htmlRow);
    });

    // STRATEGY 2: Target mat-list-item elements that contain conversation content
    if (chatElements.length === 0) {
        const listItems = document.querySelectorAll('mat-list-item[class*="conversation"], [mat-list-item][class*="conversation"]');
        console.log(`Gemini Project Manager: Found ${listItems.length} mat-list-item conversation elements`);

        listItems.forEach((item) => {
            const htmlItem = item as HTMLElement;
            if (htmlItem.getAttribute('data-ez-draggable') === 'true') return;

            const text = htmlItem.textContent?.trim() || '';
            if (text.length > 0) {
                chatElements.push(htmlItem);
            }
        });
    }

    // STRATEGY 3: Find any anchor or clickable element that links to /app/
    if (chatElements.length === 0) {
        console.log("Gemini Project Manager: Trying anchor strategy...");
        const anchors = document.querySelectorAll('a[href*="/app/"]');

        anchors.forEach((a) => {
            const htmlA = a as HTMLElement;
            if (htmlA.getAttribute('data-ez-draggable') === 'true') return;

            // Get the parent row to make the whole row draggable
            const parentRow = htmlA.closest('[class*="conversation-item"]') || htmlA;
            if ((parentRow as HTMLElement).getAttribute('data-ez-draggable') !== 'true') {
                chatElements.push(parentRow as HTMLElement);
            }
        });
    }

    // STRATEGY 4: Fallback - buttons with conversation-related classes that have title text
    if (chatElements.length === 0) {
        console.log("Gemini Project Manager: Trying button fallback...");
        const buttons = document.querySelectorAll('button[class*="conversation"]:not([class*="actions-menu"])');

        buttons.forEach((btn) => {
            const htmlBtn = btn as HTMLElement;
            const text = htmlBtn.textContent?.trim() || '';

            // Must have meaningful text (chat title)
            if (text.length < 5) return;

            // Skip system buttons
            if (text.toLowerCase().includes('new chat') ||
                text.toLowerCase().includes('settings') ||
                text === 'PRO') return;

            if (htmlBtn.getAttribute('data-ez-draggable') !== 'true') {
                console.log(`  Found chat button: "${text.substring(0, 40)}..."`);
                chatElements.push(htmlBtn);
            }
        });
    }

    console.log(`Gemini Project Manager: Final chat candidates to make draggable: ${chatElements.length}`);

    chatElements.forEach(el => {
        if (el.getAttribute('data-ez-draggable') === 'true') return;

        try {
            el.setAttribute('data-ez-draggable', 'true');
            el.setAttribute('draggable', 'true');
            el.style.cursor = 'grab';
            el.style.userSelect = 'none'; // Prevent text selection while dragging

            // Use capture phase to intercept before Gemini's page handlers
            el.addEventListener('dragstart', (e) => {
                // Stop the event from reaching Gemini's handlers
                e.stopImmediatePropagation();

                console.log("Gemini Project Manager: DRAG START FIRED on", el);

                // Visual feedback during drag
                el.style.cursor = 'grabbing';
                el.style.opacity = '0.6';

                // Extract title - clean up multiline content
                let title = el.textContent?.trim() || "Untitled Chat";
                title = title.split('\n')[0].trim();
                // Remove trailing icons/action text
                title = title.replace(/\s*(more_vert|delete|edit)$/i, '').trim();

                // === ID EXTRACTION ===
                let id: string | null = null;
                let url = "";

                // Method 1: Check if the element itself is an anchor with /app/ URL
                if (el instanceof HTMLAnchorElement && el.href.includes('/app/')) {
                    url = el.href;
                    const idMatch = url.match(/\/app\/([a-zA-Z0-9_-]{8,})/);
                    if (idMatch) {
                        id = idMatch[1];
                        console.log("Gemini Project Manager: ID extracted via Method 1 (element anchor):", id);
                    }
                }

                // Method 1b: Look for anchor child with /app/ URL
                if (!id) {
                    const anchor = el.querySelector('a[href*="/app/"]') as HTMLAnchorElement;
                    if (anchor) {
                        url = anchor.href;
                        const idMatch = url.match(/\/app\/([a-zA-Z0-9_-]{8,})/);
                        if (idMatch) {
                            id = idMatch[1];
                            console.log("Gemini Project Manager: ID extracted via Method 1b (child anchor):", id);
                        }
                    }
                }

                // Method 2: data-test-id or data-testid attributes (but only if they look like real IDs, not generic names)
                if (!id) {
                    const testId = el.getAttribute('data-test-id') ||
                        el.getAttribute('data-testid') ||
                        el.querySelector('[data-test-id]')?.getAttribute('data-test-id') ||
                        el.querySelector('[data-testid]')?.getAttribute('data-testid');
                    // Only use testId if it looks like a real unique ID (alphanumeric, 8+ chars, not generic words)
                    if (testId && !testId.includes('new-chat') && testId.length >= 8 &&
                        !['conversation', 'chat', 'item', 'row', 'container'].includes(testId.toLowerCase())) {
                        id = testId.replace(/^conversation-/, '');
                        console.log("Gemini Project Manager: ID extracted via Method 2 (data-testid):", id);
                    }
                }

                // Method 3: Look for conversation ID in any data-* attribute (but must be 8+ chars to be a real ID)
                if (!id) {
                    const allDataAttrs = el.getAttributeNames().filter(n => n.startsWith('data-') && n !== 'data-ez-draggable');
                    for (const attr of allDataAttrs) {
                        const val = el.getAttribute(attr) || '';
                        // Must be 8+ chars, alphanumeric, and not a generic word
                        if (val.length >= 8 && val.length < 50 && /^[a-zA-Z0-9_-]+$/.test(val) &&
                            !['conversation', 'chat', 'item', 'row', 'container', 'true', 'false'].includes(val.toLowerCase())) {
                            id = val;
                            console.log("Gemini Project Manager: ID extracted via Method 3 (data-* attr):", id);
                            break;
                        }
                    }
                }

                // Method 4: Walk up the DOM tree to find a parent anchor with /app/ URL
                if (!id) {
                    let parent = el.parentElement;
                    let depth = 0;
                    while (parent && !id && depth < 10) {
                        if (parent instanceof HTMLAnchorElement && parent.href.includes('/app/')) {
                            const match = parent.href.match(/\/app\/([a-zA-Z0-9_-]{8,})/);
                            if (match) {
                                id = match[1];
                                url = parent.href;
                                console.log("Gemini Project Manager: ID extracted via Method 4 (parent anchor):", id);
                            }
                        }
                        parent = parent.parentElement;
                        depth++;
                    }
                }

                // Build URL if we have an ID but no URL
                if (id && !url) {
                    url = `${window.location.origin}/app/${id}`;
                }

                // LAST RESORT: If still no ID, generate hash from title
                // This creates a UNIQUE ID per title, so different chats won't collide
                // NOTE: The discovery system will find the real ID when indexing
                if (!id) {
                    const titleHash = generateTitleHash(title);
                    id = `chat_${titleHash}`;
                    url = `${window.location.origin}/app/${id}`;
                    console.warn("Gemini Project Manager: Could not find real chat ID. Using HASH fallback:", id, "for title:", title);
                }

                console.log(`Gemini Project Manager: Drag Data - Title: "${title}", URL: ${url}, ID: ${id}`);

                if (!id) {
                    console.warn("Gemini Project Manager: Could not extract chat ID, cancelling drag");
                    e.preventDefault();
                    return;
                }

                const data = {
                    id,
                    title,
                    url,
                    timestamp: Date.now()
                };

                if (e.dataTransfer) {
                    e.dataTransfer.setData('text/plain', url);
                    e.dataTransfer.setData('application/json', JSON.stringify(data));
                    e.dataTransfer.setData('ez-files/chat-item', id);
                    e.dataTransfer.effectAllowed = 'copy';
                }
            }, { capture: true }); // Capture phase - runs before page handlers

            // Cleanup on drag end
            el.addEventListener('dragend', () => {
                el.style.cursor = 'grab';
                el.style.opacity = '1';
            }, { capture: true });

        } catch (err) {
            console.error("Gemini Project Manager: Error making element draggable", el, err);
        }
    });

    return chatElements.length;
}

// Generate a deterministic hash from a string (for creating unique IDs from titles)
function generateTitleHash(str: string): string {
    let hash = 0;
    const normalizedStr = str.toLowerCase().trim();
    for (let i = 0; i < normalizedStr.length; i++) {
        const char = normalizedStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

// Observe to handle SPA navigation updates (if the sidebar gets wiped)
const observer = new MutationObserver(() => {
    // Debounce or check efficiently
    if (!document.querySelector('.ez-projects-btn')) {
        findAndInjectButton();
    }
    // Continuously check for new chats to make draggable
    makeChatsDraggable();
});

function injectSidebar() {
    if (document.getElementById(ROOT_ID)) return;

    const rootHost = document.createElement('div');
    rootHost.id = ROOT_ID;
    document.body.appendChild(rootHost);

    const shadowRoot = rootHost.attachShadow({ mode: 'open' });

    // Inject Tailwind Styles
    const styleTag = document.createElement('style');
    styleTag.textContent = styleText;
    shadowRoot.appendChild(styleTag);

    const rootContainer = document.createElement('div');
    rootContainer.style.height = '100%';
    rootContainer.className = "font-sans text-base antialiased pointer-events-none"; // Allow clicks to pass through wrapper
    shadowRoot.appendChild(rootContainer);

    // Note: The Sidebar component inside needs to have pointer-events-auto

    const root = createRoot(rootContainer);
    root.render(
        <React.StrictMode>
            <Sidebar />
        </React.StrictMode>
    );

    // Start observing for navigation changes (sidebar re-rendering)
    observer.observe(document.body, { childList: true, subtree: true });
    // Attempt preliminary injection
    findAndInjectButton();
    makeChatsDraggable();
}


// Polling mechanism to handle async loading of chats (e.g. from network)
let pollInterval: any = null;
let pollAttempts = 0;
const MAX_POLL_ATTEMPTS = 20; // Try for 30s (20 * 1.5s)

function startChatPolling() {
    if (pollInterval) clearInterval(pollInterval);

    pollAttempts = 0;
    pollInterval = setInterval(() => {
        pollAttempts++;
        const found = makeChatsDraggable();

        // If we found a good number of chats, we can slow down or stop
        if (found && found > 0 && pollAttempts > 5) {
            // We found chats and tried a few times. Hand off to observer.
            clearInterval(pollInterval);
        }

        if (pollAttempts >= MAX_POLL_ATTEMPTS) {
            clearInterval(pollInterval);
        }
    }, 1500);
}


// Observe for DOM readiness (Gemini is an SPA)
setTimeout(() => {
    injectSidebar();
    startChatPolling();
}, 1500);

// --- Auto-Archivist Logic ---

import { storage } from '../utils/storage';


let scrapeDebounce: any = null;

function autoArchive() {
    // 1. Check if we are in a chat (URL contains /app/ID)
    const match = window.location.href.match(/\/app\/([a-zA-Z0-9_-]+)/);
    if (!match) return;

    const chatId = match[1];
    
    // Skip if this is a hash-based ID (not a real Gemini chat)
    if (chatId.startsWith('chat_')) return;

    // Debounce the scraping so we don't spam storage while scrolling/generating
    if (scrapeDebounce) clearTimeout(scrapeDebounce);

    scrapeDebounce = setTimeout(async () => {
        // Check if extension context is still valid before proceeding
        if (!isExtensionContextValid()) {
            console.warn("Gemini Project Manager: Extension context invalidated, skipping auto-archive");
            return;
        }
        
        const result = scrapeChatContent();

        if (result && result.text.length > 100) { // arbitrary min length
            // Get the chat title from the page
            const title = getPageTitle();
            
            try {
                // Check if there's a hash-based chat with matching title that needs migration
                const hashMatch = await storage.findHashChatByTitle(title);
                if (hashMatch) {
                    console.log(`Gemini Project Manager: Migrating hash chat ${hashMatch.id} to real ID ${chatId}`);
                    await storage.migrateHashToRealId(hashMatch.id, chatId, title);
                }
                
                await storage.updateChatContent(chatId, result.text, result.turnCount);
                console.log(`Gemini Project Manager: Archived ${result.turnCount} blocks for chat ${chatId}`);
            } catch (err) {
                // Silently fail if extension context is invalidated
                if (String(err).includes('invalidated')) {
                    console.warn("Gemini Project Manager: Extension context invalidated during archive");
                } else {
                    console.error("Gemini Project Manager: Archive error:", err);
                }
            }
        }
    }, 5000); // Wait 5 seconds after activity stops to save
}

// Helper to get the current page/chat title
function getPageTitle(): string {
    // Try specific Gemini selectors first
    const selectors = [
        'h1.conversation-title',
        'div[data-testid="conversation-title-region"] span',
        'span[data-testid="chat-title"]',
        '.conversation-title'
    ];

    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) return el.textContent.trim();
    }

    // Fallback to document title
    const docTitle = document.title.replace(/ - Google Gemini$/, '').trim();
    if (docTitle && docTitle !== 'Google Gemini') return docTitle;

    return 'Untitled Chat';
}

// Trigger archival - with context check
setInterval(() => {
    if (isExtensionContextValid()) autoArchive();
}, 10000); // Check every 10s if we should scrape (backup)
// Also trigger on navigation (popstate)
window.addEventListener('popstate', () => { 
    if (isExtensionContextValid()) {
        setTimeout(autoArchive, 2000); 
        checkIndexingMode(); 
    }
});
window.addEventListener('click', () => {
    if (isExtensionContextValid()) setTimeout(autoArchive, 2000);
}); // Clicks might expand content


// --- Indexing Mode Handler ---
function checkIndexingMode() {
    if (!isExtensionContextValid()) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ez_idx') === 'true') {
        // We are in a hidden indexing window
        console.log("Gemini Project Manager: Indexing Mode Active (MutationObserver State Machine)");

        // Show overlay (optional, but good for debugging if user peeks)
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);color:lime;z-index:99999;font-family:monospace;font-size:24px;display:flex;align-items:center;justify-content:center;pointer-events:none;';
        overlay.innerText = "Gemini Project Manager\nIndexing Chat...\n(Waiting for content)";
        document.body.appendChild(overlay);

        // --- State Machine ---
        let stabilityTimer: any = null;
        let stabilityDuration = 2000; // Wait for 2 seconds of silence

        const finalizeIndexing = async () => {
            const result = scrapeChatContent();
            if (result && result.text.length > 50) {
                overlay.innerText = `Indexing Complete.\nCaptured ${result.turnCount} turns.\nClosing...`;
                await storage.updateChatContent(getChatIdFromUrl()!, result.text, result.turnCount);

                safeSendMessage({
                    type: 'ARCHIVE_COMPLETE',
                    chatId: getChatIdFromUrl()
                }).catch(() => {});

                // Disconnect observer to save resources (window will close shortly)
                observer.disconnect();
            } else {
                console.warn("Gemini Project Manager: Indexing timed out but found no content.");
            }
        };

        const resetStabilityTimer = () => {
            if (stabilityTimer) clearTimeout(stabilityTimer);
            overlay.innerText = "Gemini Project Manager\nIndexing Chat...\n(Content Loading...)";

            stabilityTimer = setTimeout(() => {
                // DOM has been stable for `stabilityDuration`
                // Double check if we actually have meaningful content
                const currentContent = scrapeChatContent();
                if (currentContent && currentContent.text.length > 100) {
                    // Valid content + Stable -> Done
                    finalizeIndexing();
                } else {
                    // Stable but empty? Wait longer (Gemini might be initializing)
                    overlay.innerText = "Gemini Project Manager\nWaiting for valid content structure...";
                }
            }, stabilityDuration);
        };

        // Observer Strategy: Watch the entire body for additions.
        const observer = new MutationObserver((mutations) => {
            if (mutations.some(m => m.type === 'childList' || m.type === 'characterData')) {
                resetStabilityTimer();
            }
        });

        // Start observing
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });

        // Kickoff the timer once in case the page is already fully loaded (static)
        resetStabilityTimer();
    }
}

function getChatIdFromUrl() {
    const match = window.location.pathname.match(/\/app\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

// --- Background Chat Automation ---
// This runs inside the hidden window opened by FolderChatService

function checkBackgroundChatMode() {
    if (!isExtensionContextValid()) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ez_bg_chat') === 'true') {
        console.log("Gemini Project Manager: Background Chat Mode Active");

        // Disable UI interactions to prevent accidental clicks if user restores window
        document.body.style.pointerEvents = 'none';

        // Add visual indicator for debugging
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,100,200,0.9);color:white;padding:8px 12px;border-radius:4px;font-size:12px;z-index:99999;pointer-events:none;';
        overlay.textContent = 'BG Chat Mode';
        document.body.appendChild(overlay);

        // Listen for messages from background
        setupBackgroundChatListeners();
    }
}

function setupBackgroundChatListeners() {
    try {
        chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
            // Handle PING for ready check
            if (message.type === 'PING') {
                sendResponse({ pong: true });
                return true;
            }

            // Handle execute command
            if (message.type === 'CMD_BG_CHAT_EXECUTE') {
                console.log("Gemini Project Manager [BG]: Execute command received");
                sendResponse({ received: true });
                performChatInteraction(message.payload);
                return true;
            }
        });
        console.log("Gemini Project Manager [BG]: Listeners set up successfully");
    } catch (err) {
        console.error("Gemini Project Manager [BG]: Failed to set up listeners:", err);
    }
}

async function performChatInteraction(payload: { requestId: string; text: string; context?: string }) {
    const { requestId, text, context } = payload;
    
    try {
        // Wait for the page to be fully ready (editor available)
        await waitForEditor();

        // Combine context + query into single message for faster response
        let fullPrompt = text;
        if (context) {
            fullPrompt = `[CONTEXT - Use this information to answer the query below]\n${context}\n\n[USER QUERY]\n${text}`;
            console.log("Gemini Project Manager [BG]: Sending combined context + query...");
        } else {
            console.log("Gemini Project Manager [BG]: Sending query...");
        }

        // Inject the combined prompt
        const success = await injectAndSubmit(fullPrompt);
        if (!success) {
            throw new Error("Failed to inject prompt");
        }

        // Wait for AI response
        console.log("Gemini Project Manager [BG]: Waiting for AI response...");
        const answer = await waitForResponseCompletion();

        // Send response back to background service
        console.log("Gemini Project Manager [BG]: Response captured, sending back");
        safeSendMessage({
            type: 'BG_CHAT_RESPONSE_DONE',
            requestId,
            text: answer,
            chatId: getChatIdFromUrl()
        }).catch(err => {
            console.error("Gemini Project Manager [BG]: Failed to send response:", err);
        });

    } catch (err) {
        console.error("Gemini Project Manager [BG]: Chat interaction failed:", err);
        
        // Send error response
        safeSendMessage({
            type: 'BG_CHAT_RESPONSE_DONE',
            requestId,
            error: err instanceof Error ? err.message : String(err),
            chatId: getChatIdFromUrl()
        }).catch(() => {});
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForEditor(maxAttempts = 40): Promise<HTMLElement> {
    console.log("Gemini Project Manager [BG]: Waiting for editor...");
    for (let i = 0; i < maxAttempts; i++) {
        const editor = findEditor();
        if (editor) {
            console.log("Gemini Project Manager [BG]: Editor found after", i, "attempts");
            return editor;
        }
        await delay(500);
    }
    console.error("Gemini Project Manager [BG]: Editor not found after", maxAttempts, "attempts");
    throw new Error("Editor not found after waiting");
}

function findEditor(): HTMLElement | null {
    // Try multiple selectors for the Gemini editor (ordered by likelihood)
    const selectors = [
        // Primary Gemini editor selectors
        'div[contenteditable="true"][data-placeholder]',
        'div[contenteditable="true"]',
        'rich-textarea div[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        // Textarea fallbacks
        'textarea[placeholder*="Enter"]',
        'textarea[placeholder*="prompt"]',
        'textarea[aria-label*="prompt"]',
        'textarea[aria-label*="message"]',
        // Role-based
        'div[role="textbox"]',
        '[role="textbox"][contenteditable="true"]',
        // Generic fallbacks
        '.input-area div[contenteditable="true"]',
        'form div[contenteditable="true"]'
    ];
    
    for (const sel of selectors) {
        try {
            const el = document.querySelector(sel) as HTMLElement;
            // Check if element is visible and usable
            if (el && el.offsetParent !== null) {
                return el;
            }
        } catch {
            // Invalid selector, skip
        }
    }
    return null;
}

async function injectAndSubmit(text: string): Promise<boolean> {
    const editor = findEditor();
    if (!editor) {
        console.error("Gemini Project Manager [BG]: No editor found for injection");
        return false;
    }

    console.log("Gemini Project Manager [BG]: Injecting text into editor...");
    
    // Focus the editor
    editor.focus();
    await delay(100);
    
    // Clear existing content
    document.execCommand('selectAll', false);
    await delay(50);
    
    // Insert new text
    document.execCommand('insertText', false, text);
    
    // Dispatch input events for framework reactivity
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    
    // Wait for UI to update
    await delay(500);
    
    // Try to find and click submit button
    console.log("Gemini Project Manager [BG]: Looking for submit button...");
    const submitBtn = findSubmitButton();
    
    if (submitBtn) {
        console.log("Gemini Project Manager [BG]: Found submit button, clicking...");
        submitBtn.click();
        await delay(200);
        return true;
    }
    
    // Fallback: try pressing Enter with Ctrl (some UIs require this)
    console.log("Gemini Project Manager [BG]: No submit button found, trying Enter key...");
    
    // Try regular Enter first
    editor.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
    }));
    
    await delay(100);
    
    // Also dispatch keyup
    editor.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
    }));
    
    return true;
}

function findSubmitButton(): HTMLButtonElement | null {
    // Priority-ordered selectors for Gemini's submit button
    const selectors = [
        // Aria labels (most reliable)
        'button[aria-label="Send message"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="send"]',
        'button[aria-label*="Submit"]',
        // Data attributes
        'button[data-test-id="send-button"]',
        'button[data-testid="send-button"]',
        'button[data-testid*="send"]',
        // Class-based
        'button.send-button',
        'button.submit-button',
        // SVG icon inside button (common pattern)
        'button svg[viewBox="0 0 24 24"]', // Generic icon button parent
        // Material design icons
        'button mat-icon',
        // Form submit
        'form button[type="submit"]',
        // Buttons near input areas
        '.input-area button',
        '.chat-input button',
        '.prompt-area button'
    ];
    
    for (const sel of selectors) {
        try {
            let element = document.querySelector(sel);
            // If we selected an SVG or icon, get the parent button
            if (element && element.tagName !== 'BUTTON') {
                element = element.closest('button');
            }
            const btn = element as HTMLButtonElement;
            if (btn && !btn.disabled && btn.offsetParent !== null) {
                console.log("Gemini Project Manager [BG]: Found submit button via selector:", sel);
                return btn;
            }
        } catch {
            // Invalid selector in this browser, skip
        }
    }
    
    // Fallback: Search for buttons near the editor
    const editor = findEditor();
    if (editor) {
        // Walk up the DOM to find a container with buttons
        let container = editor.parentElement;
        for (let i = 0; i < 8 && container; i++) {
            const buttons = container.querySelectorAll('button:not([disabled])');
            for (const btn of buttons) {
                const buttonEl = btn as HTMLButtonElement;
                // Skip buttons that look like close/cancel
                const ariaLabel = buttonEl.getAttribute('aria-label')?.toLowerCase() || '';
                const innerText = buttonEl.innerText?.toLowerCase() || '';
                
                if (ariaLabel.includes('close') || ariaLabel.includes('cancel') ||
                    innerText.includes('close') || innerText.includes('cancel')) {
                    continue;
                }
                
                // Check for SVG (icon button) or specific styling
                const hasSvg = buttonEl.querySelector('svg');
                const hasIcon = buttonEl.querySelector('mat-icon, .material-icons');
                
                if ((hasSvg || hasIcon) && buttonEl.offsetParent !== null) {
                    console.log("Gemini Project Manager [BG]: Found submit button via DOM traversal");
                    return buttonEl;
                }
            }
            container = container.parentElement;
        }
    }
    
    console.warn("Gemini Project Manager [BG]: No submit button found");
    return null;
}

function waitForResponseCompletion(maxWaitMs = 180000): Promise<string> {
    return new Promise((resolve) => {
        let isGenerating = false;
        let idleChecks = 0;
        let totalChecks = 0;
        let lastResponseLength = 0;
        const checkInterval = 300; // OPTIMIZED: Faster polling (was 500ms)
        const maxChecks = maxWaitMs / checkInterval;
        
        console.log("Gemini Project Manager [BG]: Starting response wait...");
        
        const poller = setInterval(() => {
            totalChecks++;
            
            // Check for "Stop generating" button (indicates AI is generating)
            const stopBtnSelectors = [
                'button[aria-label*="Stop"]',
                'button[aria-label*="stop"]',
                'button.stop-button',
                'button[data-testid*="stop"]',
                '[aria-label*="Stop generating"]'
            ];
            
            let stopBtn = null;
            for (const sel of stopBtnSelectors) {
                stopBtn = document.querySelector(sel);
                if (stopBtn) break;
            }
            
            // Check if response content is still growing
            const currentResponse = getLastModelResponse();
            const responseGrowing = currentResponse.length > lastResponseLength + 10;
            
            lastResponseLength = currentResponse.length;

            // Only consider "generating" if we have STRONG evidence (stop button OR response growing)
            // Loading indicators alone are too unreliable (false positives)
            const strongGeneratingSignal = stopBtn || responseGrowing;
            
            if (strongGeneratingSignal) {
                isGenerating = true;
                idleChecks = 0; // Reset idle counter while generating
                if (totalChecks % 10 === 0) {
                    console.log("Gemini Project Manager [BG]: Still generating...", currentResponse.length, "chars");
                }
            } else {
                if (isGenerating) {
                    // Was generating, now stopped - give a moment for final render
                    idleChecks++;
                    if (idleChecks >= 3) {
                        console.log("Gemini Project Manager [BG]: Response complete after", totalChecks * checkInterval / 1000, "seconds");
                        clearInterval(poller);
                        resolve(getLastModelResponse());
                        return;
                    }
                } else {
                    // Not generating yet
                    idleChecks++;
                    // Check if we have any response content
                    const hasResponse = currentResponse.length > 20 && 
                                       !currentResponse.startsWith("Error:");
                    
                    if (hasResponse && idleChecks > 4) {
                        console.log("Gemini Project Manager [BG]: Found response (instant)");
                        clearInterval(poller);
                        resolve(currentResponse);
                        return;
                    } else if (idleChecks > 15) {
                        console.warn("Gemini Project Manager [BG]: No generation detected");
                        clearInterval(poller);
                        resolve(currentResponse || "Error: No response detected");
                        return;
                    }
                }
            }
            
            // Absolute timeout
            if (totalChecks >= maxChecks) {
                console.warn("Gemini Project Manager [BG]: Absolute timeout reached");
                clearInterval(poller);
                resolve(getLastModelResponse());
            }
        }, checkInterval);
    });
}

function getLastModelResponse(): string {
    // STRATEGY 1: Look for model-response elements (Gemini's custom element)
    const modelResponseSelectors = [
        'model-response',
        '[data-test-id*="model"]',
        '[data-testid*="model"]',
        '.model-response-text',
        '.response-content',
        '[class*="model-response"]',
        '[class*="assistant-message"]'
    ];
    
    for (const sel of modelResponseSelectors) {
        try {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) {
                const lastResponse = elements[elements.length - 1] as HTMLElement;
                const text = lastResponse.innerText?.trim();
                if (text && text.length > 20) {
                    console.log("Gemini Project Manager [BG]: Found response via", sel);
                    return text;
                }
            }
        } catch { /* skip */ }
    }

    // STRATEGY 2: Look for message containers with alternating roles
    const containerSelectors = [
        '[data-message-author]',
        '[role="article"]',
        '.message-container',
        '.turn-container',
        '[class*="conversation-turn"]',
        '[class*="message-row"]'
    ];
    
    for (const sel of containerSelectors) {
        try {
            const allContainers = document.querySelectorAll(sel);
            // Find the last "assistant" or "model" message
            for (let i = allContainers.length - 1; i >= 0; i--) {
                const container = allContainers[i] as HTMLElement;
                const author = container.getAttribute('data-message-author');
                const classList = container.className || '';
                
                const isModel = author === 'model' || author === 'assistant' || 
                               classList.includes('model') ||
                               classList.includes('assistant') ||
                               classList.includes('response');
                
                if (isModel) {
                    const text = container.innerText?.trim();
                    if (text && text.length > 20) {
                        console.log("Gemini Project Manager [BG]: Found response via container");
                        return text;
                    }
                }
            }
        } catch { /* skip */ }
    }

    // STRATEGY 3: Look for the main content area and find formatted text
    const mainSelectors = ['main', '[role="main"]', '.conversation-container', '#chat-container'];
    
    for (const mainSel of mainSelectors) {
        const main = document.querySelector(mainSel);
        if (main) {
            // Look for markdown-rendered content (common for AI responses)
            const markdownContent = main.querySelectorAll('.markdown, .prose, [class*="markdown"]');
            if (markdownContent.length > 0) {
                const lastMarkdown = markdownContent[markdownContent.length - 1] as HTMLElement;
                const text = lastMarkdown.innerText?.trim();
                if (text && text.length > 20) {
                    console.log("Gemini Project Manager [BG]: Found response via markdown content");
                    return text;
                }
            }
        }
    }

    // STRATEGY 4: Use the content scraper as fallback
    const result = scrapeChatContent();
    if (result && result.text && result.text.length > 50) {
        // Extract the last portion which is likely the response
        const blocks = result.text.split(/\n{2,}/);
        if (blocks.length >= 2) {
            // Return last 2-3 blocks as they likely contain the response
            console.log("Gemini Project Manager [BG]: Using scraper fallback");
            return blocks.slice(-3).join('\n\n');
        }
        return result.text.substring(Math.max(0, result.text.length - 2000));
    }

    // STRATEGY 5: Deep search for any substantial text block in main
    const main = document.querySelector('main') || document.body;
    const textContainers = main.querySelectorAll('p, div > span, pre, code, li');
    const texts: string[] = [];
    
    textContainers.forEach(el => {
        const htmlEl = el as HTMLElement;
        // Skip input areas and toolbars
        if (htmlEl.closest('[contenteditable]') || htmlEl.closest('button')) return;
        
        const text = htmlEl.innerText?.trim();
        if (text && text.length > 30 && !texts.includes(text)) {
            texts.push(text);
        }
    });
    
    if (texts.length > 0) {
        console.log("Gemini Project Manager [BG]: Using deep search fallback");
        return texts.slice(-5).join('\n\n');
    }

    return "Error: Could not extract AI response. The page structure may have changed.";
}

// --- Discovery Mode Handler ---
// This runs when we need to find a chat by title and discover its real ID
function checkDiscoveryMode() {
    if (!isExtensionContextValid()) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const isDiscoveryMode = urlParams.get('ez_discover') === 'true';
    const targetTitle = urlParams.get('ez_title');
    const hashId = urlParams.get('ez_hash_id');
    
    if (!isDiscoveryMode || !targetTitle || !hashId) return;
    
    console.log("Gemini Project Manager: Discovery Mode Active - Looking for:", targetTitle);
    
    // Show overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);color:cyan;z-index:99999;font-family:monospace;font-size:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;';
    overlay.innerHTML = `<div>Gemini Project Manager</div><div>Discovering Chat...</div><div style="font-size:14px;margin-top:10px;color:#888;">"${targetTitle.substring(0, 50)}..."</div>`;
    document.body.appendChild(overlay);
    
    // Wait for sidebar to load, then find and click the chat
    let attempts = 0;
    const maxAttempts = 20; // 20 * 500ms = 10 seconds
    
    const findAndClickChat = () => {
        attempts++;
        overlay.innerHTML = `<div>Gemini Project Manager</div><div>Discovering Chat... (${attempts}/${maxAttempts})</div><div style="font-size:14px;margin-top:10px;color:#888;">"${targetTitle.substring(0, 50)}..."</div>`;
        
        // Use findChatElement to locate the chat by title
        const chatElement = findChatElement(hashId, targetTitle);
        
        if (chatElement) {
            console.log("Gemini Project Manager: Found chat element, clicking...");
            
            overlay.innerHTML = `<div>Gemini Project Manager</div><div style="color:lime;">Chat Found! Navigating...</div>`;
            
            // Click to navigate
            chatElement.click();
            
            // Wait for navigation, then check the URL for the real ID
            setTimeout(() => {
                const match = window.location.href.match(/\/app\/([a-zA-Z0-9_-]+)/);
                if (match && !match[1].startsWith('chat_')) {
                    const realId = match[1];
                    console.log("Gemini Project Manager: Discovered real ID:", realId);
                    
                    overlay.innerHTML = `<div>Gemini Project Manager</div><div style="color:lime;">ID Found: ${realId}</div><div>Indexing content...</div>`;
                    
                    // Notify background of discovery
                    safeSendMessage({
                        type: 'DISCOVERY_COMPLETE',
                        hashId: hashId,
                        realId: realId,
                        title: targetTitle
                    }).catch(() => {});
                    
                    // Migrate the hash ID to real ID in storage
                    storage.migrateHashToRealId(hashId, realId, targetTitle).then(() => {
                        console.log("Gemini Project Manager: Migration complete");
                    }).catch(err => {
                        console.error("Gemini Project Manager: Migration failed:", err);
                    });
                    
                    // Now run the indexing flow (similar to checkIndexingMode)
                    runIndexingFlow(realId, overlay);
                } else {
                    console.warn("Gemini Project Manager: Navigation didn't result in real ID");
                    overlay.innerHTML = `<div>Gemini Project Manager</div><div style="color:orange;">Navigation pending...</div>`;
                    // Retry after a bit
                    setTimeout(() => {
                        const retryMatch = window.location.href.match(/\/app\/([a-zA-Z0-9_-]+)/);
                        if (retryMatch && !retryMatch[1].startsWith('chat_')) {
                            const realId = retryMatch[1];
                            safeSendMessage({
                                type: 'DISCOVERY_COMPLETE',
                                hashId: hashId,
                                realId: realId,
                                title: targetTitle
                            }).catch(() => {});
                            storage.migrateHashToRealId(hashId, realId, targetTitle).catch(() => {});
                            runIndexingFlow(realId, overlay);
                        } else {
                            overlay.innerHTML = `<div>Gemini Project Manager</div><div style="color:red;">Failed to discover ID</div>`;
                            safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: hashId }).catch(() => {});
                        }
                    }, 3000);
                }
            }, 2000);
            
        } else if (attempts < maxAttempts) {
            // Keep trying
            setTimeout(findAndClickChat, 500);
        } else {
            console.warn("Gemini Project Manager: Could not find chat after max attempts");
            overlay.innerHTML = `<div>Gemini Project Manager</div><div style="color:red;">Chat not found in sidebar</div><div style="font-size:12px;margin-top:10px;">The chat may have been deleted or renamed.</div>`;
            
            // Send archive complete to close the tab
            safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: hashId }).catch(() => {});
        }
    };
    
    // Start looking after sidebar has time to load
    setTimeout(findAndClickChat, 1500);
}

// Shared indexing flow used by both discovery and direct indexing
function runIndexingFlow(chatId: string, overlay: HTMLElement) {
    let stabilityTimer: any = null;
    const stabilityDuration = 3000; // Increased to 3s for more reliable detection
    
    const finalizeIndexing = async () => {
        const result = scrapeChatContent();
        
        if (result && result.text.length > 50) {
            overlay.innerHTML = `<div>Gemini Project Manager</div><div style="color:lime;">Indexing Complete!</div><div style="font-size:14px;">Captured ${result.turnCount} turns</div>`;
            try {
                await storage.updateChatContent(chatId, result.text, result.turnCount);
            } catch (err) {
                console.error("Gemini Project Manager: Failed to save content:", err);
            }
            
            safeSendMessage({
                type: 'ARCHIVE_COMPLETE',
                chatId: chatId
            }).catch(() => {});
        } else {
            console.warn("Gemini Project Manager: Indexing found no content");
            overlay.innerHTML = `<div>Gemini Project Manager</div><div style="color:orange;">No content found</div>`;
            safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: chatId }).catch(() => {});
        }
    };
    
    const resetStabilityTimer = () => {
        if (stabilityTimer) clearTimeout(stabilityTimer);
        overlay.innerHTML = `<div>Gemini Project Manager</div><div>Indexing content...</div>`;
        
        stabilityTimer = setTimeout(() => {
            const currentContent = scrapeChatContent();
            if (currentContent && currentContent.text.length > 100) {
                finalizeIndexing();
            } else {
                overlay.innerHTML = `<div>Gemini Project Manager</div><div>Waiting for content...</div>`;
                // Try again after another 2 seconds
                setTimeout(() => {
                    const retryContent = scrapeChatContent();
                    if (retryContent && retryContent.text.length > 50) {
                        finalizeIndexing();
                    } else {
                        // Give up and close
                        safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: chatId }).catch(() => {});
                    }
                }, 2000);
            }
        }, stabilityDuration);
    };
    
    // Observer for content changes
    const observer = new MutationObserver((mutations) => {
        if (mutations.some(m => m.type === 'childList' || m.type === 'characterData')) {
            resetStabilityTimer();
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    resetStabilityTimer();
}

// --- In-Page Discovery Message Handler ---
// Listens for discovery requests from background and does discovery without opening new tabs
function setupInPageDiscoveryListener() {
    if (!isExtensionContextValid()) return;
    
    try {
        chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
            if (message.type === 'CMD_IN_PAGE_DISCOVER') {
                console.log('Gemini Project Manager: In-page discovery requested for:', message.title);
                
                // Do discovery in this page
                performInPageDiscovery(message.hashId, message.title);
                sendResponse({ received: true });
                return true;
            }
        });
    } catch (err) {
        console.warn("Gemini Project Manager: Could not set up in-page discovery listener:", err);
    }
}

async function performInPageDiscovery(hashId: string, title: string) {
    // Remember current chat ID so we can go back after indexing
    const originalChatId = getChatIdFromUrl();
    
    console.log('Gemini Project Manager: Looking for chat:', title);
    
    // Find the chat element by title
    const chatElement = findChatElement(hashId, title);
    
    if (!chatElement) {
        console.warn('Gemini Project Manager: Could not find chat element for:', title);
        // Send completion to move queue forward
        safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: hashId }).catch(() => {});
        return;
    }
    
    console.log('Gemini Project Manager: Found chat, clicking to navigate...');
    
    // Click to navigate
    chatElement.click();
    
    // Wait for navigation and extract real ID
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newUrl = window.location.href;
    const match = newUrl.match(/\/app\/([a-zA-Z0-9_-]+)/);
    
    if (match && !match[1].startsWith('chat_')) {
        const realId = match[1];
        console.log('Gemini Project Manager: Discovered real ID:', realId);
        
        // Migrate hash to real ID
        try {
            await storage.migrateHashToRealId(hashId, realId, title);
            console.log('Gemini Project Manager: Migration complete');
        } catch (err) {
            console.error('Gemini Project Manager: Migration failed:', err);
        }
        
        // Wait for content to load and scrape
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const content = scrapeChatContent();
        if (content && content.text.length > 50) {
            await storage.updateChatContent(realId, content.text, content.turnCount);
            console.log('Gemini Project Manager: Content indexed:', content.turnCount, 'blocks');
        }
        
        // Navigate back to original chat if it was different
        if (originalChatId && originalChatId !== realId) {
            console.log('Gemini Project Manager: Navigating back to original chat...');
            const backElement = findChatElement(originalChatId, '');
            if (backElement) {
                backElement.click();
            }
        }
        
        // Send completion
        safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: hashId }).catch(() => {});
        
    } else {
        console.warn('Gemini Project Manager: Navigation did not result in real ID');
        safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: hashId }).catch(() => {});
    }
}

// Init
setTimeout(() => {
    setupInPageDiscoveryListener(); // Set up message listener first
    checkDiscoveryMode(); // Check discovery mode (for tabs opened with ez_discover)
    checkIndexingMode();
    checkBackgroundChatMode();
}, 2000);

