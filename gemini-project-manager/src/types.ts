export interface Chat {
    id: string; // The ID from Gemini's URL (e.g. "abcdef123")
    title: string;
    url: string;
    timestamp: number;
    // NEW: Content Caching
    content?: string;      // The full text of the conversation
    lastSynced?: number;   // When we last scraped it
    turnCount?: number;    // Metric to show size
}

export interface Workspace {
    id: string;
    name: string;
    order: number;
}

export interface Folder {
    id: string;
    workspaceId: string; // NEW: Links folder to a workspace
    name: string;
    color?: string;
    parentId: string | null; // For nesting
    collapsed?: boolean;
    chatIds: string[]; // references to Chat.id
}

export interface StorageData {
    workspaces: Workspace[];      // List of available workspaces
    activeWorkspaceId: string;    // Which one is currently open
    folders: Folder[];
    chats: Record<string, Chat>; // Map for quick lookup
    settings: {
        theme: 'dark' | 'light';
    };
}
