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
    // We look for elements that *look* like chat items (class names) and contain the title
    const candidates = allElements.filter(el => {
        // Must have the title text
        if (!el.textContent || !el.textContent.includes(chatTitle)) return false;

        // Refine: Exclude the extension's own UI to avoid self-clicking (circular)
        if (el.closest('.ez-projects-btn') || el.closest('#gemini-project-manager-root')) return false;

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

    // Pick the "best" candidate (deepest, or most specific)
    // Often the text is in a span, but we want the clickable parent (A or Button or Mat-List-Item)
    for (const cand of candidates) {
        // If candidate is clickable itself
        if (cand.tagName === 'A' || cand.tagName === 'BUTTON') return cand;

        // Or traverse up to find clickable container
        const clickable = cand.closest('a, button, mat-list-item, [role="button"]');
        if (clickable) return clickable as HTMLElement;
    }

    return null;
}

// NEW: Content Scraper
export function scrapeChatContent(): { text: string; turnCount: number } | null {
    // Strategy: Find the main scrollable container or message list
    // Gemini often uses 'infinite-scroller' or specific roles

    // We want to avoid capturing the sidebar, input area, or top nav.
    // The main content is usually in a <main> tag or specific container.
    let container = document.querySelector('main');

    // Fallbacks if <main> isn't found or is empty
    if (!container) {
        const candidates = [
            document.querySelector('.conversation-container'),
            document.querySelector('infinite-scroller'),
            document.querySelector('[role="main"]')
        ];
        container = candidates.find(c => c !== null) as HTMLElement | null;
    }

    if (!container) return null;

    // Get text. We want to clean it up.
    // Use innerText to preserve formatting
    let text = container.innerText || '';

    // --- CLEANING ---
    // 1. Remove "Context Injection" headers (from our own extension)
    // Pattern: "CONTEXT FROM FOLDER: ..." or "--- START CHAT: ..." or "--- END CHAT ---"
    text = text.replace(/CONTEXT FROM FOLDER:.*?\n/gi, '');
    text = text.replace(/--- START CHAT:.*?\n/gi, '');
    text = text.replace(/--- END CHAT ---/gi, '');

    // 2. Remove Gemini UI artifacts (commonly found at bottom or top)
    const uiArtifacts = [
        "View other drafts", "Regenerate", "Modify response", "Show drafts",
        "Google", "Gemini", "Double-check response", "Enter a prompt here",
        "Upload image", "Use microphone", "Listen", "Share", "Export"
    ];

    // Simple line-based filtering
    text = text.split('\n')
        .filter(line => {
            const trimmed = line.trim();
            if (trimmed.length < 2) return true; // Keep empty lines for spacing
            // Filter out exact matches of UI artifacts
            if (uiArtifacts.includes(trimmed)) return false;
            return true;
        })
        .join('\n');

    // Heuristic for turn counting (counting "model" icons or specific user blocks would be better, but approximate is fine)
    const turnCount = text.split(/\n\n+/).length;

    // Limit size if necessary (Chrome storage is ~5MB per item, text compresses well)
    // Truncate to ~100k chars to be safe 
    if (text.length > 100000) {
        text = text.substring(0, 100000) + "\n...[Truncated]";
    }

    return { text, turnCount };
}

// Helper to inject text into the prompt box AND submit it
export function injectPrompt(text: string) {
    const editor = document.querySelector('div[contenteditable="true"]') as HTMLElement;
    if (editor) {
        editor.focus();
        // Modern frameworks (React/Lit) need input events
        document.execCommand('insertText', false, text);
        editor.dispatchEvent(new Event('input', { bubbles: true }));

        // Give the UI a moment to register the input, then click submit
        setTimeout(() => {
            // Find the submit button - Gemini uses various selectors
            const submitBtn = document.querySelector('button[aria-label*="Send"]') as HTMLButtonElement
                || document.querySelector('button[data-test-id="send-button"]') as HTMLButtonElement
                || document.querySelector('button.send-button') as HTMLButtonElement
                // Fallback: find a button near the editor that looks like submit
                || document.querySelector('div[contenteditable="true"]')?.closest('form')?.querySelector('button[type="submit"]') as HTMLButtonElement
                // Last resort: any button with a "send" icon (paper plane SVG often)
                || document.querySelector('button:has(svg[data-icon="send"])') as HTMLButtonElement;

            if (submitBtn && !submitBtn.disabled) {
                console.log("Gemini Project Manager: Clicking submit button");
                submitBtn.click();
            } else {
                // If no button found, try pressing Enter
                console.log("Gemini Project Manager: No submit button found, simulating Enter");
                editor.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true
                }));
            }
        }, 100);
    } else {
        console.error("Gemini Project Manager: Could not find editor element");
    }
}
