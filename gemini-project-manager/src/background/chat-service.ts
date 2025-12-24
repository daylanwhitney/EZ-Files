/**
 * FolderChatService - Handles chat interactions with folder context
 * 
 * Flow:
 * 1. UI sends CMD_FOLDER_CHAT_SEND with folderId, text, context
 * 2. Service opens/reuses hidden Gemini window
 * 3. Content script receives CMD_BG_CHAT_EXECUTE, injects prompt
 * 4. Content script sends BG_CHAT_RESPONSE_DONE with response text
 * 5. Service resolves the pending request and sends response to UI
 */

interface ChatSession {
    bgChatId: string | null;
    folderId: string;
    windowId: number | null;
    tabId: number | null;
    contextSent: boolean;
    ready: boolean;
    lastUsed: number; // Timestamp for session timeout
}

interface PendingRequest {
    resolve: (response: { success: boolean; text?: string; error?: string; chatId?: string }) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

export class FolderChatService {
    private sessions: Map<string, ChatSession> = new Map(); // folderId -> session
    private pendingRequests: Map<string, PendingRequest> = new Map(); // requestId -> pending
    private processing: boolean = false;
    private queue: { 
        folderId: string; 
        text: string; 
        context?: string; 
        requestId: string;
        resolve: (response: any) => void;
        reject: (error: Error) => void;
    }[] = [];

    private readonly SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    constructor() {
        // Listen for folder chat requests from UI
        chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
            if (message.type === 'CMD_FOLDER_CHAT_SEND') {
                this.handleSendRequest(message, sendResponse);
                return true; // Async response
            }
            // Listen for close session request (when user closes folder chat UI)
            if (message.type === 'CMD_CLOSE_FOLDER_CHAT') {
                this.closeSession(message.folderId);
                sendResponse({ success: true });
                return false;
            }
        });

        // Listen for window close events to clean up sessions
        chrome.windows.onRemoved.addListener((windowId) => {
            this.handleWindowClosed(windowId);
        });

        // Periodically clean up idle sessions (every 2 minutes)
        setInterval(() => this.cleanupIdleSessions(), 2 * 60 * 1000);
    }

    private cleanupIdleSessions() {
        const now = Date.now();
        for (const [folderId, session] of this.sessions.entries()) {
            if (now - session.lastUsed > this.SESSION_TIMEOUT_MS) {
                console.log('FolderChatService: Cleaning up idle session for folder:', folderId);
                this.closeSession(folderId);
            }
        }
    }

    private async closeSession(folderId: string) {
        const session = this.sessions.get(folderId);
        if (session?.windowId) {
            try {
                await chrome.windows.remove(session.windowId);
            } catch {
                // Window already closed
            }
        }
        this.sessions.delete(folderId);
    }

    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    private handleSendRequest(message: any, sendResponse: (response: any) => void) {
        const requestId = this.generateRequestId();
        
        this.queue.push({
            folderId: message.folderId,
            text: message.text,
            context: message.context,
            requestId,
            resolve: sendResponse,
            reject: (error) => sendResponse({ success: false, error: error.message })
        });
        
        this.processQueue();
    }

    private handleWindowClosed(windowId: number) {
        // Find and clean up any session using this window
        for (const [folderId, session] of this.sessions.entries()) {
            if (session.windowId === windowId) {
                console.log(`FolderChatService: Window ${windowId} closed, clearing session for folder ${folderId}`);
                this.sessions.delete(folderId);
            }
        }
    }

    private async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        const item = this.queue[0];

        try {
            // Get or create session for this folder
            let session = this.sessions.get(item.folderId);
            
            // Validate existing session
            if (session && session.windowId) {
                try {
                    await chrome.windows.get(session.windowId);
                } catch {
                    // Window no longer exists
                    console.log('FolderChatService: Previous window no longer exists, creating new one');
                    session = undefined;
                    this.sessions.delete(item.folderId);
                }
            }

            if (!session) {
                session = await this.createSession(item.folderId);
                this.sessions.set(item.folderId, session);
            }

            // Update last used timestamp
            session.lastUsed = Date.now();

            // OPTIMIZATION: Only wait for content script if not already ready
            if (!session.ready) {
                await this.waitForContentScriptReady(session);
            } else {
                // Quick verify the tab is still responsive
                try {
                    await chrome.tabs.sendMessage(session.tabId!, { type: 'PING' });
                } catch {
                    // Tab unresponsive, recreate session
                    console.log('FolderChatService: Session tab unresponsive, recreating');
                    this.sessions.delete(item.folderId);
                    session = await this.createSession(item.folderId);
                    this.sessions.set(item.folderId, session);
                    await this.waitForContentScriptReady(session);
                }
            }

            // Prepare the message payload
            const payload = {
                requestId: item.requestId,
                text: item.text,
                context: (!session.contextSent && item.context) ? item.context : undefined
            };

            // Send message and wait for response
            const response = await this.sendMessageAndWait(session, payload, item.requestId);

            // Mark context as sent if we included it
            if (payload.context) {
                session.contextSent = true;
            }

            // Update session chat ID if provided
            if (response.chatId) {
                session.bgChatId = response.chatId;
            }

            // Resolve with success
            item.resolve({ success: true, text: response.text });

        } catch (err) {
            console.error('FolderChatService: Error processing request:', err);
            
            // Clear the session on error so next request gets a fresh start
            this.sessions.delete(item.folderId);
            
            item.reject(err instanceof Error ? err : new Error(String(err)));
        } finally {
            this.queue.shift();
            this.processing = false;
            
            // Process next item if any
            if (this.queue.length > 0) {
                setTimeout(() => this.processQueue(), 500);
            }
        }
    }

    private async createSession(folderId: string): Promise<ChatSession> {
        console.log('FolderChatService: Creating new session for folder:', folderId);

        // Create a minimized window to Gemini
        const win = await chrome.windows.create({
            url: 'https://gemini.google.com/app?ez_bg_chat=true',
            state: 'minimized',
            focused: false
        });

        if (!win?.id || !win.tabs?.[0]?.id) {
            throw new Error('Failed to create background chat window');
        }

        const session: ChatSession = {
            bgChatId: null,
            folderId,
            windowId: win.id,
            tabId: win.tabs[0].id,
            contextSent: false,
            ready: false,
            lastUsed: Date.now()
        };

        return session;
    }

    private async waitForContentScriptReady(session: ChatSession, maxAttempts = 40): Promise<void> {
        if (!session.tabId) throw new Error('No tab ID in session');

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                // Check if tab is complete
                const tab = await chrome.tabs.get(session.tabId);
                if (tab.status !== 'complete') {
                    await this.delay(500);
                    continue;
                }

                // Ping the content script
                const response = await chrome.tabs.sendMessage(session.tabId, { type: 'PING' });
                if (response?.pong) {
                    session.ready = true;
                    console.log('FolderChatService: Content script ready');
                    return;
                }
            } catch {
                // Content script not ready yet
            }
            
            await this.delay(500);
        }

        throw new Error('Timeout waiting for content script to be ready');
    }

    private async sendMessageAndWait(
        session: ChatSession, 
        payload: { requestId: string; text: string; context?: string },
        requestId: string
    ): Promise<{ text: string; chatId?: string }> {
        if (!session.tabId) throw new Error('No tab ID in session');

        return new Promise((resolve, reject) => {
            // Set up timeout (600 seconds = 10 minutes - context + query + slow response detection)
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                console.error('FolderChatService: Request timed out for', requestId);
                reject(new Error('Timeout waiting for AI response'));
            }, 600000);

            // Register pending request
            this.pendingRequests.set(requestId, {
                resolve: (response) => {
                    clearTimeout(timeout);
                    this.pendingRequests.delete(requestId);
                    if (response.success) {
                        resolve({ text: response.text || '', chatId: response.chatId });
                    } else {
                        reject(new Error(response.error || 'Unknown error'));
                    }
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    this.pendingRequests.delete(requestId);
                    reject(error);
                },
                timeout
            });

            // Send the execute command to content script
            chrome.tabs.sendMessage(session.tabId!, {
                type: 'CMD_BG_CHAT_EXECUTE',
                payload
            }).catch((err) => {
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                reject(new Error(`Failed to send message to content script: ${err.message}`));
            });
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Handle responses from content script
     * Called by service worker when it receives BG_CHAT_RESPONSE_DONE
     */
    public handleExternalResponse(message: any) {
        console.log('FolderChatService: Received external response:', message);

        const requestId = message.requestId;
        if (!requestId) {
            console.warn('FolderChatService: Response missing requestId');
            return;
        }

        const pending = this.pendingRequests.get(requestId);
        if (!pending) {
            console.warn('FolderChatService: No pending request for requestId:', requestId);
            return;
        }

        if (message.error) {
            pending.resolve({ success: false, error: message.error });
        } else {
            pending.resolve({ 
                success: true, 
                text: message.text,
                chatId: message.chatId 
            });
        }
    }

    /**
     * Close all active sessions (cleanup)
     */
    public async closeAllSessions() {
        for (const [folderId, session] of this.sessions.entries()) {
            if (session.windowId) {
                try {
                    await chrome.windows.remove(session.windowId);
                } catch {
                    // Window already closed
                }
            }
            this.sessions.delete(folderId);
        }
    }
}
