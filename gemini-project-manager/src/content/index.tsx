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

function findAndInjectButton() {
    // Check if we already injected
    if (document.querySelector('.ez-projects-btn')) return;

    // Strategy: Find "New Chat" and "Chats" (or "Recent") to define the sidebar bounds
    const spanElements = Array.from(document.querySelectorAll('span'));

    // 1. Find anchor points
    const newChatSpan = spanElements.find(el => el.textContent?.trim() === 'New chat' || el.textContent?.trim() === 'New Chat');
    const chatsSpan = spanElements.find(el => el.textContent?.trim() === 'Chats' || el.textContent?.trim() === 'Recent');

    let targetContainer: HTMLElement | null = null;
    // let itemsContainer: HTMLElement | null = null; // Unused

    // 2. Identify likely sidebar container using Least Common Ancestor (LCA)
    if (newChatSpan && chatsSpan) {
        const parents1 = getParents(newChatSpan);
        const parents2 = getParents(chatsSpan);

        // Find the first common parent
        targetContainer = parents1.find(p => parents2.includes(p)) || null;

        if (targetContainer) {
            console.log("Gemini Project Manager: Found LCA container:", targetContainer);
        }
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

// Observer to handle SPA navigation updates (if the sidebar gets wiped)
const observer = new MutationObserver(() => {
    // Debounce or check efficiently
    if (!document.querySelector('.ez-projects-btn')) {
        findAndInjectButton();
    }
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
}


// Observe for DOM readiness (Gemini is an SPA)
setTimeout(injectSidebar, 1500);
