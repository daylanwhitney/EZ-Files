/**
 * FolderChatService - Handles chat interactions with folder context
 * 
 * Uses Gemini API directly (no hidden browser windows)
 * Requires API key to be configured in settings
 */

import { callGeminiAPI } from '../utils/gemini-api';

// Chrome storage wrapper for getting API key (duplicated here for service worker context)
async function getApiKey(): Promise<string | null> {
    const result = await chrome.storage.local.get('geminiApiKey') as { geminiApiKey?: string };
    return result.geminiApiKey || null;
}

export class FolderChatService {
    private conversationHistory: Map<string, { role: string; text: string }[]> = new Map();

    constructor() {
        // Listen for folder chat requests from UI
        chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
            if (message.type === 'CMD_FOLDER_CHAT_SEND') {
                this.handleChatRequest(message, sendResponse);
                return true; // Async response
            }
            if (message.type === 'CMD_CLOSE_FOLDER_CHAT') {
                // Clear conversation history for this folder
                this.conversationHistory.delete(message.folderId);
                sendResponse({ success: true });
                return false;
            }
        });

        // Meta-prompt requests (for Auto-Enhance)
        chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
            if (message.type === 'CMD_BG_CHAT_EXECUTE') {
                this.handleMetaPromptRequest(message, sendResponse);
                return true;
            }
        });
    }

    private async handleChatRequest(message: any, sendResponse: (response: any) => void) {
        const { folderId, text, context, workspacePrompt } = message;

        try {
            const apiKey = await getApiKey();
            if (!apiKey) {
                sendResponse({ success: false, error: 'API key not configured. Please add your Gemini API key in Settings.' });
                return;
            }

            // Build the prompt with context
            let fullPrompt = text;

            // Get or create conversation history
            let history = this.conversationHistory.get(folderId) || [];

            // If context provided and this is first message, prepend it
            if (context && history.length === 0) {
                fullPrompt = `[CONTEXT - Folder Contents]\n${context}\n\n[USER QUERY]\n${text}`;
            }

            // Add user message to history
            history.push({ role: 'user', text: fullPrompt });

            // Build conversation context for API
            const conversationContext = history.length > 1
                ? history.slice(0, -1).map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`).join('\n\n')
                : undefined;

            // Build system instruction: workspace persona + context helper
            let systemInstruction = '';
            if (workspacePrompt) {
                systemInstruction = workspacePrompt;
            }
            if (context && history.length === 1) {
                systemInstruction = (systemInstruction ? systemInstruction + '\n\n' : '') +
                    'You also have access to the user\'s project folder contents. Answer questions based on the provided context.';
            }

            const response = await callGeminiAPI(
                apiKey,
                conversationContext ? `Previous conversation:\n${conversationContext}\n\nUser: ${text}` : fullPrompt,
                systemInstruction
            );

            // Add assistant response to history
            history.push({ role: 'assistant', text: response });

            // Keep only last 10 exchanges to prevent context overflow
            if (history.length > 20) {
                history = history.slice(-20);
            }
            this.conversationHistory.set(folderId, history);

            sendResponse({ success: true, text: response });

        } catch (error: any) {
            console.error('FolderChatService: API call failed:', error);
            sendResponse({ success: false, error: error.message || 'API call failed' });
        }
    }

    private async handleMetaPromptRequest(message: any, sendResponse: (response: any) => void) {
        const payload = message.payload;

        try {
            const apiKey = await getApiKey();
            if (!apiKey) {
                sendResponse({ success: false, error: 'API key not configured. Please add your Gemini API key in Settings.' });
                return;
            }

            const response = await callGeminiAPI(apiKey, payload.text, payload.context);
            sendResponse({ success: true, text: response });

        } catch (error: any) {
            console.error('FolderChatService: Meta-prompt failed:', error);
            sendResponse({ success: false, error: error.message || 'API call failed' });
        }
    }

    /**
     * Handle responses from content script (legacy - kept for compatibility)
     */
    public handleExternalResponse(_message: any) {
        // No longer used with API-based approach
        console.debug('FolderChatService: Legacy handleExternalResponse called (ignored)');
    }

    public async closeAllSessions() {
        this.conversationHistory.clear();
    }
}
