// Queue item type
interface QueueItem {
    id: string;
    title: string;
    needsDiscovery: boolean;
}

// Robust Indexing Queue using tabs and load detection
export class IndexingQueue {
    private queue: QueueItem[] = [];
    private isProcessing: boolean = false;
    private currentTabId: number | null = null;
    private processingTimeout: any = null;
    private loadListener: ((tabId: number, changeInfo: { status?: string }) => void) | null = null;

    constructor() {
        // Listen for completion messages from content script
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'ARCHIVE_COMPLETE') {
                console.log('Gemini Project Manager: Indexing Complete for', message.chatId);
                this.finishCurrentItem();
            }
            // Handle discovery complete - content script found the real ID
            if (message.type === 'DISCOVERY_COMPLETE') {
                console.log('Gemini Project Manager: Discovery Complete -', message.hashId, '->', message.realId);
            }
        });

        // Cleanup on startup
        this.cleanup();
    }

    addToQueue(chatId: string, title?: string) {
        // For hash-based IDs, we need to find the real ID first
        // We'll use a special discovery mode that finds the chat by title
        const queueItem: QueueItem = chatId.startsWith('chat_') 
            ? { id: chatId, title: title || '', needsDiscovery: true }
            : { id: chatId, title: title || '', needsDiscovery: false };
        
        if (!this.queue.some(item => item.id === chatId)) {
            console.log('Gemini Project Manager: Added to queue:', chatId, queueItem.needsDiscovery ? '(needs discovery)' : '');
            this.queue.push(queueItem);
            this.processNext();
        }
    }

    private async processNext() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const item = this.queue[0]; // Peek, don't shift yet

        console.log('Gemini Project Manager: Processing:', item.id, item.needsDiscovery ? '(discovery mode)' : '');

        try {
            if (item.needsDiscovery) {
                // In-page discovery - send message to active Gemini tab instead of opening new tab
                const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
                
                if (tabs.length > 0) {
                    const geminiTab = tabs[0];
                    
                    // Send message to the content script to do in-page discovery
                    chrome.tabs.sendMessage(geminiTab.id!, {
                        type: 'CMD_IN_PAGE_DISCOVER',
                        hashId: item.id,
                        title: item.title
                    }).catch(err => {
                        console.error('Gemini Project Manager: Failed to send discovery message:', err);
                    });
                    
                    this.currentTabId = null; // We're not creating a new tab
                } else {
                    // No Gemini tab open - skip this item, user will trigger indexing when they open the chat
                    console.log('Gemini Project Manager: No Gemini tab open, skipping discovery');
                    this.finishCurrentItem();
                    return;
                }
            } else {
                // Direct indexing mode: Open the chat directly (for real IDs)
                const url = `https://gemini.google.com/app/${item.id}?ez_idx=true`;

                // Create a background tab for direct indexing
                const tab = await chrome.tabs.create({
                    url,
                    active: false
                });

                this.currentTabId = tab?.id || null;

                if (this.currentTabId) {
                    this.loadListener = (tabId, changeInfo) => {
                        if (tabId === this.currentTabId && changeInfo.status === 'complete') {
                            console.log('Gemini Project Manager: Tab loaded, content script should activate.');
                            if (this.loadListener) {
                                chrome.tabs.onUpdated.removeListener(this.loadListener);
                                this.loadListener = null;
                            }
                        }
                    };
                    chrome.tabs.onUpdated.addListener(this.loadListener);
                }
            }

            // Safety timeout
            const timeout = 30000;
            this.processingTimeout = setTimeout(() => {
                console.warn('Gemini Project Manager: Indexing timed out for', item.id);
                this.finishCurrentItem();
            }, timeout);

        } catch (err) {
            console.error('Gemini Project Manager: Failed to process item', err);
            this.finishCurrentItem();
        }
    }

    private async finishCurrentItem() {
        // 1. Clear timeout
        if (this.processingTimeout) clearTimeout(this.processingTimeout);
        this.processingTimeout = null;

        // 2. Remove load listener if still active
        if (this.loadListener) {
            chrome.tabs.onUpdated.removeListener(this.loadListener);
            this.loadListener = null;
        }

        // 3. Close tab
        if (this.currentTabId) {
            try {
                await chrome.tabs.remove(this.currentTabId);
            } catch (ignore) {
                // Tab might already be closed
            }
            this.currentTabId = null;
        }

        // 4. Remove from queue
        this.queue.shift();
        this.isProcessing = false;

        // 5. Process next after a short delay
        setTimeout(() => this.processNext(), 1000);
    }

    private cleanup() {
        // Cleanup logic for any stale state (not strictly necessary but good practice)
    }
}
