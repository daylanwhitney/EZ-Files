import { storage } from '../utils/storage';
import { scrapeChatContent, findChatElement, injectPrompt } from '../utils/dom';

console.log("Gemini Project Manager: Content Script Loaded");

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
            console.debug("Gemini Project Manager: Extension context invalidated, skipping message");
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

// --- Theme Detection ---
function isLightMode(): boolean {
    // Strategy 1: Check body background color
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    if (bodyBg) {
        // Parse RGB values
        const match = bodyBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const [, r, g, b] = match.map(Number);
            // Light mode if average RGB > 128
            const brightness = (r + g + b) / 3;
            if (brightness > 128) return true;
            if (brightness < 80) return false;
        }
    }

    // Strategy 2: Check for dark theme classes on body or html
    const htmlClasses = document.documentElement.className.toLowerCase();
    const bodyClasses = document.body.className.toLowerCase();
    if (htmlClasses.includes('dark') || bodyClasses.includes('dark')) return false;
    if (htmlClasses.includes('light') || bodyClasses.includes('light')) return true;

    // Strategy 3: Check prefers-color-scheme
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return true;
    }

    // Default to dark (Gemini default)
    return false;
}

// --- Projects Button ---
// --- Projects Button ---
const FOLDER_ICON = `
<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M20 4H12L10 2H4C2.9 2 2.01 2.9 2.01 4L2 20C2 21.1 2.9 22 4 22H20C21.1 22 22 21.1 22 20V6C22 4.9 21.1 4 20 4ZM20 20H4V6H20V20Z" />
</svg>
`;

function createProjectsButton(referenceElement?: HTMLElement): HTMLElement {
    const isLight = isLightMode();

    const button = document.createElement('button');
    button.className = 'ez-projects-btn';
    button.setAttribute('type', 'button');

    // If we have a reference element, copy its styles
    if (referenceElement) {
        const refStyle = window.getComputedStyle(referenceElement);
        button.style.cssText = `
            display: flex;
            align-items: center;
            gap: ${refStyle.gap || '12px'};
            padding: ${refStyle.padding || '12px 24px'};
            margin: ${refStyle.margin || '0'};
            width: 100%;
            cursor: pointer;
            border: none;
            background: transparent;
            border-radius: ${refStyle.borderRadius || '0 9999px 9999px 0'};
            color: ${refStyle.color || (isLight ? '#1f2937' : '#c4c7c5')};
            font-family: ${refStyle.fontFamily || "'Google Sans', Roboto, sans-serif"};
            font-size: ${refStyle.fontSize || '14px'};
            font-weight: ${refStyle.fontWeight || '500'};
            text-align: left;
            transition: background-color 0.2s, color 0.2s;
            box-sizing: border-box;
            line-height: ${refStyle.lineHeight || 'normal'};
            letter-spacing: ${refStyle.letterSpacing || 'normal'};
        `;
    } else {
        // Fallback styles
        button.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 24px;
            margin: 0;
            width: 100%;
            cursor: pointer;
            border: none;
            background: transparent;
            border-radius: 0 9999px 9999px 0;
            color: ${isLight ? '#1f2937' : '#c4c7c5'};
            font-family: 'Google Sans', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            text-align: left;
            transition: background-color 0.2s, color 0.2s;
            box-sizing: border-box;
        `;
    }

    button.innerHTML = `
        <span style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">${FOLDER_ICON}</span>
        <span>Projects</span>
    `;

    // Hover effects matching Gemini's style
    button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = isLight ? '#e8eaed' : '#37393b';
    });
    button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = 'transparent';
    });

    // Click opens the Side Panel
    button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isExtensionContextValid()) {
            console.log("Gemini Project Manager: Extension context invalidated, cannot open side panel. Please reload the page.");
            return;
        }

        try {
            await chrome.runtime.sendMessage({ type: 'CMD_OPEN_SIDE_PANEL' });
        } catch (err: any) {
            // Silently handle context invalidation errors
            if (err?.message?.includes('Extension context invalidated')) {
                console.log("Gemini Project Manager: Extension was reloaded. Please refresh the page.");
            } else {
                console.error("Gemini Project Manager: Failed to open Side Panel", err);
            }
        }
    });

    return button;
}

function findAndInjectButton() {
    // Check if already injected
    if (document.querySelector('.ez-projects-btn')) return;

    // Find key elements in the sidebar to determine insertion point and copy styles
    const allElements = document.querySelectorAll('*');
    let myStuffElement: HTMLElement | null = null;
    let myStuffClickable: HTMLElement | null = null;
    let newChatElement: HTMLElement | null = null;
    let newChatClickable: HTMLElement | null = null;

    for (const el of allElements) {
        const text = el.textContent?.trim();
        // Must be a leaf node or near-leaf (avoid matching parent containers)
        if (el.children.length > 3) continue;

        if (text === 'My Stuff' && !myStuffElement) {
            myStuffElement = el as HTMLElement;
            // Find the clickable parent (button or anchor)
            myStuffClickable = el.closest('button, a, [role="button"]') as HTMLElement;
            console.log("Gemini Project Manager: Found My Stuff element:", el.tagName, myStuffClickable);
        }
        if ((text === 'New chat' || text === 'New Chat') && !newChatElement) {
            newChatElement = el as HTMLElement;
            newChatClickable = el.closest('button, a, [role="button"]') as HTMLElement;
            console.log("Gemini Project Manager: Found New chat element:", el.tagName, newChatClickable);
        }
    }

    // Use the clickable reference for styling
    const styleReference = myStuffClickable || newChatClickable;

    // Strategy 1: Insert before "My Stuff" (which puts it after New Chat)
    if (myStuffElement) {
        const btn = createProjectsButton(styleReference || undefined);

        // Find the parent container for My Stuff
        let myStuffContainer: HTMLElement | null = myStuffClickable || myStuffElement;
        while (myStuffContainer && myStuffContainer.parentElement) {
            const parent: HTMLElement = myStuffContainer.parentElement;
            const visibleChildren = Array.from(parent.children).filter(
                c => (c as HTMLElement).offsetHeight > 0
            );
            if (visibleChildren.length >= 2) {
                parent.insertBefore(btn, myStuffContainer);
                console.log("Gemini Project Manager: Injected Projects button before My Stuff");
                return;
            }
            myStuffContainer = parent;
        }
    }

    // Strategy 2: Insert after "New chat" if found
    if (newChatElement) {
        const btn = createProjectsButton(styleReference || undefined);

        let newChatContainer: HTMLElement | null = newChatClickable || newChatElement;
        while (newChatContainer && newChatContainer.parentElement) {
            const parent: HTMLElement = newChatContainer.parentElement;
            const visibleChildren = Array.from(parent.children).filter(
                c => (c as HTMLElement).offsetHeight > 0
            );
            if (visibleChildren.length >= 2) {
                if (newChatContainer.nextSibling) {
                    parent.insertBefore(btn, newChatContainer.nextSibling);
                } else {
                    parent.appendChild(btn);
                }
                console.log("Gemini Project Manager: Injected Projects button after New Chat");
                return;
            }
            newChatContainer = parent;
        }
    }

    // Strategy 3: Find the sidebar/drawer container directly
    const sidebarSelectors = [
        'mat-drawer',
        'mat-sidenav',
        '[role="navigation"]',
        'nav',
        '.sidebar',
        '[class*="drawer"]',
        '[class*="sidenav"]'
    ];

    for (const sel of sidebarSelectors) {
        const sidebar = document.querySelector(sel);
        if (sidebar && (sidebar as HTMLElement).offsetHeight > 100) {
            const btn = createProjectsButton();
            // Try to append near the top
            if (sidebar.firstChild) {
                sidebar.insertBefore(btn, sidebar.firstChild);
            } else {
                sidebar.appendChild(btn);
            }
            console.log("Gemini Project Manager: Injected Projects button into sidebar via selector:", sel);
            return;
        }
    }

    console.log("Gemini Project Manager: Could not find suitable location for button injection. My Stuff found:", !!myStuffElement, "New Chat found:", !!newChatElement);
}

// Watch for theme changes and update button
function setupThemeObserver() {
    const updateButtonTheme = () => {
        const btn = document.querySelector('.ez-projects-btn') as HTMLElement;
        if (btn) {
            const isLight = isLightMode();
            btn.style.color = isLight ? '#1f2937' : '#e3e3e3';
        }
    };

    // Check periodically for theme changes
    setInterval(updateButtonTheme, 2000);

    // Also observe class changes on body/html
    const themeObserver = new MutationObserver(updateButtonTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
}
// 20 attempts * 500ms debounce ~= 10 seconds before fallback

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
                let rawTitle = el.textContent?.trim() || "Untitled Chat";
                let title = rawTitle.split('\n')[0].trim();
                // Remove trailing icons/action text
                if (title) {
                    title = title.replace(/\s*(more_vert|delete|edit)$/i, '').trim();
                }

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
                    // This is expected behavior for chats without real IDs - they'll be discovered when indexed
                    console.log("Gemini Project Manager: Using hash ID for chat:", title.substring(0, 30));
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

// Observe to handle SPA navigation updates (ensure draggability persists)
const observer = new MutationObserver(() => {
    // Continuously check for new chats to make draggable
    makeChatsDraggable();
});

function injectSidebar() {
    // Side Panel Migration: No longer injecting sidebar into DOM.
    // We only observe needed elements.
    observer.observe(document.body, { childList: true, subtree: true });
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
    injectSidebar(); // Sets up observers
    startChatPolling();
    setupSidePanelListeners();
    findAndInjectButton(); // Inject the Projects button
    setupThemeObserver(); // Watch for theme changes
}, 1500);

// --- Auto-Archivist Logic ---




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
            console.debug("Gemini Project Manager: Extension context invalidated, skipping auto-archive");
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
                }).catch(() => { });

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

async function performChatInteraction(payload: { requestId: string; text: string; context?: string; autoDelete?: boolean }) {
    const { requestId, text, context, autoDelete } = payload;

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

        // If autoDelete is requested (e.g. for meta-prompts), delete this chat
        if (autoDelete) {
            console.log("Gemini Project Manager [BG]: Auto-deleting temporary chat...");
            await deleteCurrentChat();
        }

        // Send response back to background service
        console.log("Gemini Project Manager [BG]: Response captured, sending back");
        safeSendMessage({
            type: 'BG_CHAT_RESPONSE_DONE',
            requestId,
            text: answer,
            chatId: getChatIdFromUrl()
        }).catch(err => {
            console.error("Gemini Project Manager [BG]: Failed to send response:", err?.message || String(err));
        });

    } catch (err) {
        console.error("Gemini Project Manager [BG]: Chat interaction failed:", err);

        // Send error response
        safeSendMessage({
            type: 'BG_CHAT_RESPONSE_DONE',
            requestId,
            error: err instanceof Error ? err.message : String(err),
            chatId: getChatIdFromUrl()
        }).catch(() => { });
    }
}

// Helper: Delete the current chat (for temporary/meta-prompt chats)
async function deleteCurrentChat(): Promise<void> {
    try {
        // Find the delete button in the chat options menu
        // First, find and click the "more options" (three dots) button
        const moreOptionsSelectors = [
            'button[aria-label*="more"]',
            'button[aria-label*="More"]',
            'button[aria-label*="options"]',
            'button[data-testid*="menu"]',
            'button mat-icon-button',
            '[aria-haspopup="menu"]'
        ];

        let moreBtn: HTMLElement | null = null;
        for (const sel of moreOptionsSelectors) {
            const btn = document.querySelector(sel) as HTMLElement;
            if (btn && btn.offsetParent !== null) {
                moreBtn = btn;
                break;
            }
        }

        if (!moreBtn) {
            console.debug("Gemini Project Manager [BG]: Could not find more options button for delete (non-critical)");
            return;
        }

        moreBtn.click();
        await delay(300);

        // Now find and click the delete option
        const deleteSelectors = [
            'button[aria-label*="Delete"]',
            'button[aria-label*="delete"]',
            '[role="menuitem"]:has-text("Delete")',
            'mat-menu-item:has-text("Delete")',
            'button:has(mat-icon[fonticon="delete"])'
        ];

        // Fallback: search for menu items with "Delete" text
        const menuItems = document.querySelectorAll('[role="menuitem"], mat-menu-item, .mat-mdc-menu-item');
        let deleteBtn: HTMLElement | null = null;

        for (const item of menuItems) {
            if (item.textContent?.toLowerCase().includes('delete')) {
                deleteBtn = item as HTMLElement;
                break;
            }
        }

        if (!deleteBtn) {
            for (const sel of deleteSelectors) {
                try {
                    const btn = document.querySelector(sel) as HTMLElement;
                    if (btn && btn.offsetParent !== null) {
                        deleteBtn = btn;
                        break;
                    }
                } catch { /* skip invalid selectors */ }
            }
        }

        if (deleteBtn) {
            deleteBtn.click();
            await delay(300);

            // Confirm the deletion if there's a confirmation dialog
            const confirmBtn = document.querySelector('button[aria-label*="Confirm"], button[data-testid*="confirm"], .mdc-dialog__button--accept') as HTMLElement;
            if (confirmBtn) {
                confirmBtn.click();
            }

            console.debug("Gemini Project Manager [BG]: Chat deleted successfully");
        } else {
            console.debug("Gemini Project Manager [BG]: Could not find delete button (non-critical)");
        }
    } catch (err) {
        console.debug("Gemini Project Manager [BG]: Failed to delete chat (non-critical):", err);
    }
}

// --- Side Panel Listeners ---
function setupSidePanelListeners() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type === 'CMD_GET_CURRENT_CHAT_INFO') {
            sendResponse({
                title: getPageTitle(),
                url: window.location.href,
                chatId: getChatIdFromUrl()
            });
            return true;
        }

        if (message.type === 'CMD_OPEN_CHAT') {
            const { chatId, url, title } = message;
            const el = findChatElement(chatId, title || '');
            if (el) {
                el.click();
            } else {
                window.location.href = url;
            }
            sendResponse({ success: true });
            return true;
        }
    });
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
                    }).catch(() => { });

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
                            }).catch(() => { });
                            storage.migrateHashToRealId(hashId, realId, targetTitle).catch(() => { });
                            runIndexingFlow(realId, overlay);
                        } else {
                            overlay.innerHTML = `<div>Gemini Project Manager</div><div style="color:red;">Failed to discover ID</div>`;
                            safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: hashId }).catch(() => { });
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
            safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: hashId }).catch(() => { });
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
            }).catch(() => { });
        } else {
            console.warn("Gemini Project Manager: Indexing found no content");
            overlay.innerHTML = `<div>Gemini Project Manager</div><div style="color:orange;">No content found</div>`;
            safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: chatId }).catch(() => { });
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
                        safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: chatId }).catch(() => { });
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
        safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: hashId }).catch(() => { });
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
        safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: hashId }).catch(() => { });

    } else {
        console.warn('Gemini Project Manager: Navigation did not result in real ID');
        safeSendMessage({ type: 'ARCHIVE_COMPLETE', chatId: hashId }).catch(() => { });
    }
}

// Init
setTimeout(() => {
    setupInPageDiscoveryListener(); // Set up message listener first
    checkDiscoveryMode(); // Check discovery mode (for tabs opened with ez_discover)
    checkIndexingMode();
    checkBackgroundChatMode();
    setupSnippetQuickInject(); // Feature 6

    // Check for default workspace prompt (Feature 5)
    // Give it a moment for storage to be ready and editor to appear
    setTimeout(checkWorkspaceDefault, 1000);

    // Re-check on navigation
    window.addEventListener('popstate', () => {
        setTimeout(checkWorkspaceDefault, 1000);
    });
}, 2000);

// --- Feature 5: Workspace Default Context ---
async function checkWorkspaceDefault() {
    if (!isExtensionContextValid()) return;

    // Only run if we are on a "New Chat" page
    // Gemini URLs: /app (new), /app/ID (existing)
    const isNewChat = window.location.pathname === '/app' || window.location.pathname === '/' || window.location.pathname.endsWith('/app');

    if (!isNewChat) return;

    try {
        const data = await storage.get();
        if (!data.activeWorkspaceId) return;

        const workspace = data.workspaces.find(w => w.id === data.activeWorkspaceId);
        if (workspace && workspace.defaultPrompt) {
            const editor = await waitForEditor(10); // Check quickly
            if (editor) {
                // Only inject if empty
                if (!editor.innerText.trim()) {
                    console.log("Gemini Project Manager: Injecting Workspace Default Prompt");
                    injectPrompt(workspace.defaultPrompt);
                }
            }
        }
    } catch (err) {
        console.error("Gemini Project Manager: Failed to inject default prompt", err);
    }
}

// --- Feature 6: Quick Context Injection (@ snippets) ---
function setupSnippetQuickInject() {
    let snippetPopup: HTMLElement | null = null;
    let activeIndex = 0;
    let filteredSnippets: any[] = [];
    let lastAtPos = { x: 0, y: 0 };
    let lastSemiTime = 0; // Track double-semicolon

    // Create Popup
    const createPopup = () => {
        if (snippetPopup) return snippetPopup;
        const el = document.createElement('div');
        el.className = 'ez-snippet-popup';
        el.style.cssText = `
            position: fixed;
            z-index: 99999;
            background: #1e1f20;
            border: 1px solid #444746;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            width: 300px;
            max-height: 200px;
            overflow-y: auto;
            display: none;
            color: #e3e3e3;
            font-family: 'Google Sans', sans-serif;
            font-size: 14px;
        `;
        document.body.appendChild(el);
        snippetPopup = el;
        return el;
    };

    const hidePopup = () => {
        if (snippetPopup) snippetPopup.style.display = 'none';
        activeIndex = 0;
    };

    const insertSnippet = (content: string) => {
        const editor = findEditor();
        if (editor) {
            // Only focus if we don't have it (though onmousedown prevents blur, it's safe to check)
            if (document.activeElement !== editor) {
                editor.focus();
            }

            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                // Check if we can find ';;' immediately before cursor
                const anchorNode = selection.anchorNode;
                const anchorOffset = selection.anchorOffset;

                let rangeToReplace: Range | null = null;

                if (anchorNode && anchorNode.nodeType === Node.TEXT_NODE) {
                    const text = anchorNode.textContent || '';
                    if (anchorOffset >= 2) {
                        const prevTwo = text.substring(anchorOffset - 2, anchorOffset);
                        if (prevTwo === ';;') {
                            rangeToReplace = document.createRange();
                            rangeToReplace.setStart(anchorNode, anchorOffset - 2);
                            rangeToReplace.setEnd(anchorNode, anchorOffset);
                        }
                    }
                }

                if (rangeToReplace) {
                    // Select the range to replace so insertText overwrites it
                    selection.removeAllRanges();
                    selection.addRange(rangeToReplace);
                } else {
                    // Fallback: If we can't confirm ';;' is there, just insert.
                    // DO NOT DELETE blindly, as that risks deleting user content if cursor moved.
                    // Better to leave ';;' than delete 'Hello World'.
                    console.warn("Gemini Project Manager: Could not find ';;' at cursor. Inserting content without deletion.");
                }
            }

            // Insert new content (replaces selection if we set it)
            document.execCommand('insertText', false, content);
        }
        hidePopup();
    };

    const renderSnippets = (snippets: any[]) => {
        if (!snippetPopup) return;
        if (snippets.length === 0) {
            hidePopup();
            return;
        }

        snippetPopup.innerHTML = '';
        snippets.forEach((s, idx) => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid #2d2e2f;
                ${idx === activeIndex ? 'background: #004a77;' : 'hover:background: #2d2e2f;'}
            `;
            item.innerHTML = `
                <div style="font-weight: 500;">${s.title}</div>
                <div style="font-size: 12px; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.content}</div>
            `;

            // KEY FIX: Use onmousedown + preventDefault to keep focus on editor!
            item.onmousedown = (e) => {
                e.preventDefault(); // Stop focus loss
                e.stopPropagation();
                insertSnippet(s.content);
            };

            snippetPopup!.appendChild(item);
        });
        snippetPopup.style.display = 'block';

        // ... (positioning logic unchanged) ...

        // Position near cursor (approx) or center
        // If we captured coordinates:
        if (lastAtPos.x > 0) {
            snippetPopup.style.left = `${lastAtPos.x}px`;
            snippetPopup.style.top = `${lastAtPos.y - snippetPopup.offsetHeight - 10}px`;
        } else {
            // Center bottom
            const editor = findEditor();
            if (editor) {
                const rect = editor.getBoundingClientRect();
                snippetPopup.style.left = `${rect.left}px`;
                snippetPopup.style.bottom = `${window.innerHeight - rect.top + 10}px`;
            }
        }
    };

    // Listen for input
    document.addEventListener('keyup', async (e) => {
        const target = e.target as HTMLElement;
        const isEditor = target.getAttribute('contenteditable') === 'true' || target.role === 'textbox';

        if (!isEditor) return;

        // If popup is open, handle navigation
        if (snippetPopup && snippetPopup.style.display !== 'none') {
            if (e.key === 'ArrowDown') {
                activeIndex = (activeIndex + 1) % filteredSnippets.length;
                renderSnippets(filteredSnippets);
                e.preventDefault();
                return;
            } else if (e.key === 'ArrowUp') {
                activeIndex = (activeIndex - 1 + filteredSnippets.length) % filteredSnippets.length;
                renderSnippets(filteredSnippets);
                e.preventDefault();
                return;
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (filteredSnippets[activeIndex]) {
                    insertSnippet(filteredSnippets[activeIndex].content);
                }
                return;
            } else if (e.key === 'Escape') {
                hidePopup();
                return;
            }
        }

        // Logic to detect ';;' trigger sequence
        if (e.key === ';') {
            const now = Date.now();
            if (lastSemiTime && (now - lastSemiTime < 500)) {
                // Double semicolon detected!

                // Save position
                const selection = window.getSelection();
                if (selection && selection.rangeCount) {
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    lastAtPos = { x: rect.left, y: rect.top };
                }

                // Load snippets
                const data = await storage.get();
                if (data.snippets && data.snippets.length > 0) {
                    filteredSnippets = data.snippets;
                    createPopup();
                    renderSnippets(filteredSnippets);
                }

                lastSemiTime = 0; // Reset
                return;
            }
            lastSemiTime = now;
        } else {
            // Reset if any other key
            lastSemiTime = 0;
        }

        // Filtering
        if (snippetPopup && snippetPopup.style.display !== 'none') {
            // Extract query text after @
            // Find text from last @ position?
            // Simplification: just show all snippets for now when @ is recently typed.
            // Real implementation would parse the text.
            // Just filtering by "Space" or "Escape" to close.
            if (e.key === ' ' || e.key === 'Escape') {
                hidePopup();
            }
        }
    });

    // Close popup when clicking outside
    document.addEventListener('click', (e) => {
        if (snippetPopup && snippetPopup.style.display !== 'none') {
            if (!snippetPopup.contains(e.target as Node)) {
                hidePopup();
            }
        }
    });
}

// Note: Floating Reference Panel is now handled as a popup window via service worker
