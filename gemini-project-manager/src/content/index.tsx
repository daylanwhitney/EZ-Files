import React from 'react';
import { createRoot } from 'react-dom/client';
import Sidebar from '../components/Sidebar';
import styleText from '../index.css?inline';

console.log("Gemini Project Manager: Content Script Loaded");

const ROOT_ID = 'gemini-project-manager-root';

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

// Keep track of retry attempts to trigger fallback
let retryCount = 0;
const MAX_RETRIES = 20; // 20 attempts * 500ms debounce ~= 10 seconds before fallback

function getParents(element: HTMLElement): HTMLElement[] {
    const parents = [];
    let current = element.parentElement;
    while (current) {
        parents.push(current);
        current = current.parentElement;
    }
    return parents;
}

// Helper to find the sidebar container
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

// Helper to find all elements matching a selector, piercing Shadow DOM
function deepQuerySelectorAll(root: Node, selector: string): HTMLElement[] {
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
        // console.log(`Gemini Project Manager: Sidebar not found (Attempt ${retryCount}/${MAX_RETRIES})`);

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

    // STRATEGY 1: Target the conversation row containers
    // These are the main clickable/hoverable rows in the sidebar
    // Look for elements with class containing "conversation-item" (the row wrapper)
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

                // Method 1: Direct anchor link
                const anchor = el.querySelector('a[href*="/app/"]') ||
                    (el instanceof HTMLAnchorElement && el.href.includes('/app/') ? el : null);
                if (anchor) {
                    url = (anchor as HTMLAnchorElement).href;
                    const idMatch = url.match(/\/app\/([a-zA-Z0-9_-]+)/);
                    id = idMatch ? idMatch[1] : null;
                }

                // Method 2: data-test-id or data-testid attributes
                if (!id) {
                    const testId = el.getAttribute('data-test-id') ||
                        el.getAttribute('data-testid') ||
                        el.querySelector('[data-test-id]')?.getAttribute('data-test-id') ||
                        el.querySelector('[data-testid]')?.getAttribute('data-testid');
                    if (testId && !testId.includes('new-chat')) {
                        id = testId.replace(/^conversation-/, '');
                    }
                }

                // Method 3: Look for conversation ID in any data-* attribute
                if (!id) {
                    const allDataAttrs = el.getAttributeNames().filter(n => n.startsWith('data-'));
                    for (const attr of allDataAttrs) {
                        const val = el.getAttribute(attr) || '';
                        if (val.length > 5 && val.length < 50 && /^[a-zA-Z0-9_-]+$/.test(val)) {
                            id = val;
                            break;
                        }
                    }
                }



                // Build URL if we have an ID but no URL
                if (id && !url) {
                    url = `${window.location.origin}/app/${id}`;
                }
                // Ensure we have an ID – generate a UUID if missing
                if (!id) {
                    id = crypto.randomUUID();
                    if (!url) {
                        url = `${window.location.origin}/app/${id}`;
                    }
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

// Simple hash function for generating fallback IDs
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
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
        // But since user might scroll/load more, we might want to keep observing.
        // The MutationObserver handles the rest.
        // This polling is mainly for the initial "chats appear from network" phase.
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
