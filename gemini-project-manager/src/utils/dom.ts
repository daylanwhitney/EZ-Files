export function deepQuerySelectorAll(root: Node, selector: string): HTMLElement[] {
    let results: HTMLElement[] = [];

    if (root.nodeType === Node.ELEMENT_NODE) {
        const el = root as HTMLElement;
        if (el.matches && el.matches(selector)) {
            results.push(el);
        }

        if (el.shadowRoot) {
            results = results.concat(deepQuerySelectorAll(el.shadowRoot, selector));
        }
    }

    if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        const fragment = root as DocumentFragment;
        for (let i = 0; i < fragment.children.length; i++) {
            results = results.concat(deepQuerySelectorAll(fragment.children[i], selector));
        }
    }

    if (root.childNodes) {
        for (let i = 0; i < root.childNodes.length; i++) {
            results = results.concat(deepQuerySelectorAll(root.childNodes[i], selector));
        }
    }

    return results;
}

export function getParents(element: HTMLElement): HTMLElement[] {
    const parents = [];
    let current = element.parentElement;
    while (current) {
        parents.push(current);
        current = current.parentElement;
    }
    return parents;
}

/**
 * Attempts to find the DOM element for a chat in the sidebar.
 * Strategy:
 * 1. Search by ID in href (anchor tags)
 * 2. Search by Title (text content)
 * 
 * Returns the clickable element (anchor or button) or null.
 */
export function findChatElement(chatId: string, chatTitle: string): HTMLElement | null {
    console.log(`Gemini Project Manager: searching for chat element ID=${chatId} Title="${chatTitle}"`);

    const allElements = deepQuerySelectorAll(document.body, '*'); // Expensive, but necessary for deep shadow DOM

    // Strategy 1: Find by Link URL (most reliable for real IDs)
    const exactLink = allElements.find(el => {
        if (el instanceof HTMLAnchorElement && el.href.includes(`/app/${chatId}`)) {
            return true;
        }
        return false;
    });

    if (exactLink) {
        console.log("Gemini Project Manager: Found chat by URL match");
        return exactLink;
    }

    // Strategy 2: Find by Title (fallback for generated IDs or "fake" IDs)
    console.log(`Gemini Project Manager: Strategy 1 failed. Real ID? ${chatId && !chatId.startsWith('chat_')}`);

    // DANGER: Only use this if we don't have a real ID, because matching by title is fuzzy and can click headers.

    // If we have a real Gemini ID (not starting with chat_), and we didn't find the link above,
    // it means the chat is likely not in the current sidebar DOM (older chat).
    // In this case, DO NOT try to find by title, because we might click the page title or other UI elements.
    // Returning null will force a safe URL navigation.
    if (chatId && !chatId.startsWith('chat_')) {
        console.log("Gemini Project Manager: Real ID provided but not found in sidebar. STRICT MODE: Returning null.");
        return null;
    }

    console.log("Gemini Project Manager: Falling back to Fuzzy Title Search (Strategy 2)");

    // We look for elements that *look* like chat items (class names) and contain the title
    const candidates = allElements.filter(el => {
        // Must have the title text
        if (!chatTitle || !chatTitle.trim()) return false;
        if (!el.textContent || !el.textContent.includes(chatTitle)) return false;

        // Refine: Exclude the extension's own UI to avoid self-clicking (circular)
        if (el.closest('.ez-projects-btn') || el.closest('#gemini-project-manager-root')) return false;

        // Refine: Exclude Header / Top Bar elements (crucial fix for user issue)
        // Gemini headers usually are in <header> or have specific classes, but safest is to check general structure
        if (el.closest('header') || el.closest('[role="banner"]')) {
            // console.log("Gemini Project Manager: Rejecting header candidate", el);
            return false;
        }

        // Exclude profile menu items and account buttons specifically
        if (el.closest('[role="menu"]') || el.closest('[aria-label*="account" i]') || el.closest('[aria-label*="profile" i]')) {
            console.log("Gemini Project Manager: Rejecting menu/profile candidate", el);
            return false;
        }

        // Exclude the main conversation title H1 (which is clickable for renaming)
        if (el.tagName === 'H1' || el.closest('h1') || el.classList.contains('conversation-title')) return false;

        // Check for key classes that Gemini uses (this might change, so it's heuristic)
        const classStr = typeof el.className === 'string' ? el.className : el.getAttribute('class') || '';
        if (typeof classStr === 'string' && (
            classStr.includes('conversation') ||
            classStr.includes('mat-list-item') ||
            el.tagName === 'A' ||
            el.tagName === 'BUTTON'
        )) {
            return true;
        }
        return false;
    });

    console.log(`Gemini Project Manager: Found ${candidates.length} candidates`, candidates);

    // Pick the "best" candidate (deepest, or most specific)
    // Often the text is in a span, but we want the clickable parent (A or Button or Mat-List-Item)
    for (const cand of candidates) {
        // If candidate is clickable itself
        if (cand.tagName === 'A' || cand.tagName === 'BUTTON') {
            console.log("Gemini Project Manager: Chose clickable candidate", cand);
            return cand;
        }

        // Or traverse up to find clickable container
        const clickable = cand.closest('a, button, mat-list-item, [role="button"]');
        if (clickable) {
            console.log("Gemini Project Manager: Chose parent clickable", clickable);
            return clickable as HTMLElement;
        }
    }

    console.log("Gemini Project Manager: No valid clickable candidate found.");
    return null;
}

// Content Scraper - Extracts conversation turns from Gemini chat
export interface ConversationTurn {
    role: 'user' | 'model';
    text: string;
}

export function scrapeChatContent(): { text: string; turnCount: number; turns?: ConversationTurn[] } | null {
    console.log("Gemini Project Manager: Starting chat content scrape...");

    const turns: ConversationTurn[] = [];

    // Strategy 1: Look for message containers (Gemini uses various structures)
    // Common patterns: [data-message-author-role], .message-content, query-chip (user), model-response

    // Try to find message elements
    const allElements = Array.from(document.querySelectorAll('*'));

    // Look for elements that contain "user" or "model" role indicators
    const messageContainers = allElements.filter(el => {
        const role = el.getAttribute('data-message-author-role');
        if (role === 'user' || role === 'model') return true;

        // Alternative: check classes for common patterns
        const classStr = el.className?.toString() || '';
        if (classStr.includes('query-chip') || classStr.includes('user-query')) return true;
        if (classStr.includes('model-response') || classStr.includes('response-container')) return true;

        return false;
    });

    if (messageContainers.length > 0) {
        console.log(`Gemini Project Manager: Found ${messageContainers.length} message containers`);

        // Filter to only get top-level containers (not nested)
        const topLevelContainers = messageContainers.filter(container => {
            // Check if any parent is also a message container
            let parent = container.parentElement;
            while (parent) {
                if (messageContainers.includes(parent)) {
                    return false; // This is a child, skip it
                }
                parent = parent.parentElement;
            }
            return true;
        });

        console.log(`Gemini Project Manager: ${topLevelContainers.length} top-level containers after filtering`);

        const seenTexts = new Set<string>();

        for (const container of topLevelContainers) {
            const role = container.getAttribute('data-message-author-role');
            const classStr = container.className?.toString() || '';

            let turnRole: 'user' | 'model' = 'model';
            if (role === 'user' || classStr.includes('user') || classStr.includes('query')) {
                turnRole = 'user';
            }

            const text = (container as HTMLElement).innerText?.trim();

            // Skip empty, very short, or duplicate texts
            if (!text || text.length < 5) continue;

            // Create a normalized key for deduplication
            const normalizedKey = text.substring(0, 100).toLowerCase();
            if (seenTexts.has(normalizedKey)) {
                console.log("Gemini Project Manager: Skipping duplicate message");
                continue;
            }
            seenTexts.add(normalizedKey);

            turns.push({ role: turnRole, text });
        }
    }

    // Strategy 2: Fallback - Find the main conversation area and parse heuristically
    if (turns.length === 0) {
        console.log("Gemini Project Manager: No message containers found, using fallback scraping");

        // Find the main content area, excluding sidebar and input
        let mainContent = document.querySelector('main');
        if (!mainContent) {
            mainContent = document.querySelector('[role="main"]');
        }

        if (mainContent) {
            // Try to exclude known UI elements
            const clone = mainContent.cloneNode(true) as HTMLElement;

            // Remove sidebar-like elements
            clone.querySelectorAll('nav, aside, [role="navigation"], [role="complementary"]').forEach(el => el.remove());
            // Remove input areas
            clone.querySelectorAll('textarea, [contenteditable], input, .prompt-container, rich-textarea').forEach(el => el.remove());
            // Remove buttons and toolbars
            clone.querySelectorAll('button, [role="toolbar"], .toolbar').forEach(el => el.remove());

            let text = clone.innerText || '';

            // Clean up common UI strings
            const uiPatterns = [
                /^(Gemini|Google|PRO|Share|More|Copy|Edit|Regenerate|View other drafts|Show drafts|Double-check response|Enter a prompt|Upload image|Use microphone|Listen|Export)\s*$/gim,
                /^[0-9]+\/[0-9]+$/gm, // Page numbers like "1/2"
                /Show thinking/gi,
            ];

            for (const pattern of uiPatterns) {
                text = text.replace(pattern, '');
            }

            // Clean up excessive whitespace
            text = text.replace(/\n{3,}/g, '\n\n').trim();

            if (text.length > 50) {
                // Can't determine turns, treat as single model response
                turns.push({ role: 'model', text });
            }
        }
    }

    if (turns.length === 0) {
        console.log("Gemini Project Manager: No content found");
        return null;
    }

    // Build the text representation (for backward compatibility)
    let textOutput = '';
    for (const turn of turns) {
        const prefix = turn.role === 'user' ? '👤 You:\n' : '🤖 Gemini:\n';
        textOutput += prefix + turn.text + '\n\n---\n\n';
    }
    textOutput = textOutput.trim();

    // Truncate if too large
    if (textOutput.length > 100000) {
        textOutput = textOutput.substring(0, 100000) + '\n...[Truncated]';
    }

    console.log(`Gemini Project Manager: Scraped ${turns.length} turns, ${textOutput.length} chars`);

    return {
        text: textOutput,
        turnCount: turns.length,
        turns
    };
}

/**
 * Find the Gemini editor element using multiple selector strategies
 */
export function findEditor(): HTMLElement | null {
    const selectors = [
        'div[contenteditable="true"]',
        'rich-textarea div[contenteditable="true"]',
        '.ql-editor',
        'textarea[placeholder*="prompt"]',
        'textarea[placeholder*="Enter"]',
        'div[role="textbox"]',
        '[data-testid="text-input"]'
    ];

    for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement;
        if (el && el.offsetParent !== null) { // Check if visible
            return el;
        }
    }
    return null;
}

/**
 * Find the submit button using multiple selector strategies
 */
export function findSubmitButton(): HTMLButtonElement | null {
    // Priority-ordered list of selectors
    const selectors = [
        // Aria labels (most reliable if present)
        'button[aria-label*="Send"]',
        'button[aria-label*="send"]',
        'button[aria-label*="Submit"]',
        // Test IDs
        'button[data-test-id="send-button"]',
        'button[data-testid="send-button"]',
        // Class names
        'button.send-button',
        'button.submit-button',
        // Form submit
        'form button[type="submit"]',
        // Rich textarea buttons
        'rich-textarea button:not([disabled])',
    ];

    for (const sel of selectors) {
        try {
            const btn = document.querySelector(sel) as HTMLButtonElement;
            if (btn && !btn.disabled && btn.offsetParent !== null) {
                return btn;
            }
        } catch {
            // Some selectors (like :has) may not be supported in all browsers
        }
    }

    // Fallback: Find button near editor with SVG icon
    const editor = findEditor();
    if (editor) {
        // Look in parent containers
        let container = editor.parentElement;
        for (let i = 0; i < 5 && container; i++) {
            const buttons = container.querySelectorAll('button:not([disabled])');
            for (const btn of buttons) {
                // Check if it looks like a send button (has SVG or specific text)
                const hasIcon = btn.querySelector('svg, mat-icon');
                const text = btn.textContent?.toLowerCase() || '';
                if (hasIcon || text.includes('send') || text.includes('submit')) {
                    return btn as HTMLButtonElement;
                }
            }
            container = container.parentElement;
        }
    }

    return null;
}

/**
 * Inject text into the prompt box AND submit it
 * Returns true if submission was attempted, false if editor not found
 */
export function injectPrompt(text: string): boolean {
    const editor = findEditor();

    if (!editor) {
        console.error("Gemini Project Manager: Could not find editor element");
        return false;
    }

    // Focus the editor
    editor.focus();

    // Clear existing content and insert new text
    // Using execCommand for maximum compatibility with frameworks
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);

    // Dispatch events for framework reactivity
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));

    // Give the UI a moment to register the input, then submit
    setTimeout(() => {
        const submitBtn = findSubmitButton();

        if (submitBtn) {
            console.log("Gemini Project Manager: Clicking submit button");
            submitBtn.click();
        } else {
            // Fallback: try pressing Enter
            console.log("Gemini Project Manager: No submit button found, simulating Enter");

            // Try both keyboard event and direct enter simulation
            editor.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));

            // Also try keypress and keyup for frameworks that listen to those
            editor.dispatchEvent(new KeyboardEvent('keypress', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
            }));

            editor.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
            }));
        }
    }, 150);

    return true;
}

/**
 * Inject text and wait for submission to be processed
 * Returns a promise that resolves when the text has been submitted
 */
export async function injectPromptAsync(text: string): Promise<boolean> {
    return new Promise((resolve) => {
        const success = injectPrompt(text);
        if (!success) {
            resolve(false);
            return;
        }

        // Wait for the submission to be processed
        setTimeout(() => resolve(true), 500);
    });
}
