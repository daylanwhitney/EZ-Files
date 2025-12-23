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
