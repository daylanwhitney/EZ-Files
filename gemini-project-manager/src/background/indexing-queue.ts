
// Robust Indexing Queue using tabs and load detection
export class IndexingQueue {
    private queue: string[] = [];
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
        });

        // Cleanup on startup
        this.cleanup();
    }

    addToQueue(chatId: string) {
        if (!this.queue.includes(chatId)) {
            console.log('Gemini Project Manager: Added to queue:', chatId);
            this.queue.push(chatId);
            this.processNext();
        }
    }

    private async processNext() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const chatId = this.queue[0]; // Peek, don't shift yet

        console.log('Gemini Project Manager: Processing:', chatId);

        try {
            const url = `https://gemini.google.com/app/${chatId}?ez_idx=true`;

            // Create a tab instead of a window (more reliable for content scripts)
            const tab = await chrome.tabs.create({
                url,
                active: false // Keep it in background
            });

            this.currentTabId = tab?.id || null;

            if (this.currentTabId) {
                // Set up a listener for when the tab finishes loading
                this.loadListener = (tabId, changeInfo) => {
                    if (tabId === this.currentTabId && changeInfo.status === 'complete') {
                        console.log('Gemini Project Manager: Tab loaded, content script should activate.');
                        // The content script will now run and detect ez_idx=true
                        // We rely on the MutationObserver + 2s stability to send ARCHIVE_COMPLETE

                        // Remove this one-shot listener
                        if (this.loadListener) {
                            chrome.tabs.onUpdated.removeListener(this.loadListener);
                            this.loadListener = null;
                        }
                    }
                };
                chrome.tabs.onUpdated.addListener(this.loadListener);
            }

            // Safety timeout (30s) - if content script never responds
            this.processingTimeout = setTimeout(() => {
                console.warn('Gemini Project Manager: Indexing timed out for', chatId);
                this.finishCurrentItem();
            }, 30000);

        } catch (err) {
            console.error('Gemini Project Manager: Failed to open tab', err);
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
