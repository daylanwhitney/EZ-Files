import { useState, useEffect } from 'react';

/**
 * Custom hook that observes Gemini's sidebar to detect which chat is currently active.
 * Returns the title of the active chat by observing DOM changes.
 */
export function useActiveChat() {
    const [activeTitle, setActiveTitle] = useState<string | null>(null);

    useEffect(() => {
        // Function to find the active chat in Gemini's sidebar
        const findActiveChat = (): string | null => {
            // STRATEGY 1: Use document.title first - most reliable
            // Gemini sets the page title to the active chat's title
            const docTitle = document.title
                .replace(/ - Google Gemini$/, '')
                .replace(/ \| Gemini$/, '')
                .replace(/ - Gemini$/, '')
                .trim();

            if (docTitle &&
                docTitle !== 'Google Gemini' &&
                docTitle !== 'Gemini' &&
                docTitle !== 'New chat' &&
                docTitle.length > 2) {
                return docTitle;
            }

            // STRATEGY 2: Look for elements with "active" or "selected" in their class names
            const activeSelectors = [
                '[class*="active"][class*="conversation"]',
                '[class*="selected"][class*="conversation"]',
                '[aria-selected="true"]',
                '[class*="active"][role="listitem"]',
                '[class*="selected"][role="listitem"]',
                'button[class*="conversation"][class*="active"]',
                'a[class*="conversation"][class*="active"]',
            ];

            for (const selector of activeSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        const text = el.textContent?.trim();
                        if (text && text.length > 2 &&
                            !text.toLowerCase().includes('new chat') &&
                            !text.toLowerCase().includes('settings')) {
                            const title = text.split('\n')[0].trim();
                            if (title.length > 0) {
                                return title;
                            }
                        }
                    }
                } catch (e) {
                    // Selector might be invalid, continue
                }
            }

            // STRATEGY 3: Look for the currently focused/highlighted conversation
            // by checking computed styles for background color differences
            const conversationItems = document.querySelectorAll(
                '[class*="conversation"], [role="listitem"], [class*="chat-item"], mat-list-item'
            );
            for (const item of conversationItems) {
                const style = window.getComputedStyle(item);
                const bgColor = style.backgroundColor;
                // Check for non-default/non-transparent backgrounds
                if (bgColor &&
                    bgColor !== 'rgba(0, 0, 0, 0)' &&
                    bgColor !== 'transparent' &&
                    bgColor !== 'rgb(255, 255, 255)' &&
                    bgColor !== 'rgb(0, 0, 0)') {
                    const text = item.textContent?.trim();
                    if (text && text.length > 2 &&
                        !text.toLowerCase().includes('new chat')) {
                        return text.split('\n')[0].trim();
                    }
                }
            }

            return null;
        };

        // Initial check
        const initialTitle = findActiveChat();
        if (initialTitle) {
            setActiveTitle(initialTitle);
        }

        // Set up observer for DOM changes
        const observer = new MutationObserver(() => {
            const newTitle = findActiveChat();
            setActiveTitle(prev => {
                if (prev !== newTitle) {
                    console.log('Gemini Project Manager: Active title changed to:', newTitle);
                    return newTitle;
                }
                return prev;
            });
        });

        // Observe the document body for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'aria-selected', 'style']
        });

        // Also poll periodically as a fallback (faster polling)
        const interval = setInterval(() => {
            const newTitle = findActiveChat();
            setActiveTitle(prev => (prev !== newTitle ? newTitle : prev));
        }, 800);

        return () => {
            observer.disconnect();
            clearInterval(interval);
        };
    }, []);

    return { activeTitle };
}
