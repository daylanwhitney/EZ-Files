
interface ChatSession {
    bgChatId: string | null;
    folderId: string;
    contextSent: boolean;
}

export class FolderChatService {
    private sessions: Map<string, ChatSession> = new Map(); // folderId -> session
    private activeWindowId: number | null = null;
    private processing: boolean = false;
    private queue: { folderId: string, text: string, context?: string, callback: (response: any) => void }[] = [];

    constructor() {
        chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
            if (message.type === 'CMD_FOLDER_CHAT_SEND') {
                this.handleSendRequest(message, sendResponse);
                return true; // Async response
            }
        });
    }

    private handleSendRequest(message: any, sendResponse: (response: any) => void) {
        this.queue.push({
            folderId: message.folderId,
            text: message.text,
            context: message.context,
            callback: sendResponse
        });
        this.processQueue();
    }

    private async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        const item = this.queue[0];

        try {
            // 1. Get or Create Session
            let session = this.sessions.get(item.folderId);
            if (!session) {
                // Determine a Chat ID? WE need to create one.
                // For now, we'll open a "New Chat" window and grab it.
                // But simplifying: We'll open a hidden window to a SPECIFIC URL if we knew it?
                // Actually, we need to create a new chat first.
                // Let's assume we can't easily "create" a background chat without opening a tab.
                // Strategy: Open minimized window to /app/
                // Wait for it to redirect to /app/ID
                // Save that ID.
                session = { bgChatId: null, folderId: item.folderId, contextSent: false };
                this.sessions.set(item.folderId, session);
            }

            // 2. Open Window to Session
            // If we have an ID, open that. If not, open /app/ (new chat)
            const url = session.bgChatId
                ? `https://gemini.google.com/app/${session.bgChatId}`
                : `https://gemini.google.com/app`;

            // Close previous if exists?
            if (this.activeWindowId) {
                try { await chrome.windows.remove(this.activeWindowId); } catch (e) { }
            }

            const win = await chrome.windows.create({
                url: url + "?ez_bg_chat=true", // Add param to signify background chat mode
                state: 'minimized',
                focused: false
            });
            this.activeWindowId = win?.id || null;

            // 3. Delegate to Content Script in that Window
            // We need to wait for it to load.
            // The content script will tell us when it's ready.
            // ... Ideally we use messaging.

            // To simplify implementation for this turn:
            // We will rely on `chrome.tabs.onUpdated` to inject the message once loaded.

            // Wait for tab safely
            const tabId = win?.tabs?.[0]?.id;
            if (!tabId) throw new Error("No tab in window");

            // We need a way to pass data. We'll use scripting execution?
            // Or wait for the content script to say "I'm ready"

            // Let's start a poller here to find the tab and send message
            await this.sendMessageToTab(tabId, item, session);

            // 4. Success? Logic handled inside sendMessageToTab via msg response or scraper results
            // ...

        } catch (err) {
            console.error(err);
            item.callback({ success: false, error: (err as any).message });
            this.shiftQueue();
        }
    }

    private async sendMessageToTab(tabId: number, item: any, session: ChatSession) {
        // Poll for tab status
        let attempts = 0;
        const maxAttempts = 30; // 30s

        const poller = setInterval(() => {
            attempts++;
            chrome.tabs.sendMessage(tabId, {
                type: 'CMD_BG_CHAT_EXECUTE',
                payload: {
                    text: item.text,
                    context: (!session.contextSent && item.context) ? item.context : undefined
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    // Not ready yet
                    if (attempts >= maxAttempts) {
                        clearInterval(poller);
                        item.callback({ success: false, error: "Timeout waiting for BG Chat" });
                        this.shiftQueue();
                    }
                    return;
                }

                if (response && response.received) {
                    clearInterval(poller);

                    // Great, now we assume the content script is handling it.
                    // We need to Capture the response...
                    // The content script should reply with the AI text when done.

                    // Update session if we just created a new one
                    if (response.newChatId && !session.bgChatId) {
                        session.bgChatId = response.newChatId;
                    }
                    if (item.context) session.contextSent = true;

                    // The sendResponse from the content script will contain the final answer?
                    // No, sendMessage callback is usually immediate.
                    // We need a secondary listener for "RESPONSE_READY"
                }
            });
        }, 1000);
    }

    // Helper to move queue
    private shiftQueue() {
        this.queue.shift();
        this.processing = false;
        setTimeout(() => this.processQueue(), 500);
    }

    // Separate listener for results
    public handleExternalResponse(message: any) {
        // When content script finishes scraping the response
        if (message.type === 'BG_CHAT_RESPONSE_DONE') {
            const item = this.queue[0];
            if (item) {
                // Update session ID if we didn't have it (redundant check)
                const session = this.sessions.get(item.folderId);
                if (session && message.chatId) session.bgChatId = message.chatId;

                item.callback({ success: true, text: message.text });

                // Close window?
                if (this.activeWindowId) {
                    chrome.windows.remove(this.activeWindowId);
                    this.activeWindowId = null;
                }

                this.shiftQueue();
            }
        }
    }
}
