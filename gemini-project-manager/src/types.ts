export interface Chat {
    id: string; // The ID from Gemini's URL (e.g. "abcdef123")
    title: string;
    url: string;
    timestamp: number;
}

export interface Folder {
    id: string;
    name: string;
    color?: string;
    parentId: string | null; // For nesting
    collapsed?: boolean;
    chatIds: string[]; // references to Chat.id
}

export interface StorageData {
    folders: Folder[];
    chats: Record<string, Chat>; // Map for quick lookup
    settings: {
        theme: 'dark' | 'light';
    };
}
