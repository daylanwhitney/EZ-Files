import type { Folder, Chat, StorageData, Workspace, Snippet } from '../types';

const DEFAULT_DATA: StorageData = {
    workspaces: [],
    activeWorkspaceId: '',
    folders: [],
    chats: {},
    snippets: [],
    settings: { theme: 'dark' },
    recentRepos: [],
};

// Storage mutex to prevent race conditions
// Multiple rapid get→modify→save cycles can cause data loss if not serialized
let storageLock: Promise<void> = Promise.resolve();

// Wrapper to serialize storage operations
async function withStorageLock<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for previous operation to complete
    const previousLock = storageLock;

    let releaseLock: () => void = () => { };
    storageLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
    });

    try {
        await previousLock; // Wait for previous operation
        return await fn();  // Execute our operation
    } finally {
        releaseLock(); // Release lock for next operation
    }
}

export const storage = {
    /**
     * Migrate a hash-based chat ID to a real chat ID.
     * This is called when we discover the real ID for a previously dropped chat.
     * It updates all folder memberships and the chats record.
     */
    migrateHashToRealId: async (hashId: string, realId: string, title: string): Promise<boolean> => {
        return withStorageLock(async () => {
            const data = await storage.get();

            // Check if hash-based chat exists
            if (!data.chats[hashId]) {
                return false;
            }

            console.log(`Gemini Project Manager: Migrating hash ID ${hashId} to real ID ${realId}`);

            // Get the hash-based chat data
            const hashChat = data.chats[hashId];

            // Create or update the real chat entry
            const realChat = data.chats[realId] || {};
            data.chats[realId] = {
                ...realChat,
                id: realId,
                title: title || hashChat.title,
                url: `https://gemini.google.com/app/${realId}`,
                timestamp: hashChat.timestamp || Date.now(),
                content: realChat.content || hashChat.content, // Preserve any existing content
                turnCount: realChat.turnCount || hashChat.turnCount
            };

            // Update all folders: replace hashId with realId
            const updatedFolders = data.folders.map(folder => {
                if (folder.chatIds.includes(hashId)) {
                    // Remove hashId, add realId if not already present
                    const newChatIds = folder.chatIds.filter(id => id !== hashId);
                    if (!newChatIds.includes(realId)) {
                        newChatIds.push(realId);
                    }
                    return { ...folder, chatIds: newChatIds };
                }
                return folder;
            });

            // Delete the hash-based chat entry
            delete data.chats[hashId];

            await storage.save({ folders: updatedFolders, chats: data.chats });
            console.log(`Gemini Project Manager: Migration complete. Folders updated.`);
            return true;
        });
    },

    /**
     * Find a chat by title that has a hash-based ID (starts with "chat_")
     */
    findHashChatByTitle: async (title: string): Promise<{ id: string; chat: any } | null> => {
        const data = await storage.get();
        const normalizedTitle = title.toLowerCase().trim();

        for (const [id, chat] of Object.entries(data.chats)) {
            if (id.startsWith('chat_') && chat.title) {
                const chatTitleNorm = chat.title.toLowerCase().trim();
                // Check for exact match or one contains the other
                if (chatTitleNorm === normalizedTitle ||
                    chatTitleNorm.includes(normalizedTitle) ||
                    normalizedTitle.includes(chatTitleNorm)) {
                    return { id, chat };
                }
            }
        }
        return null;
    },

    get: async (): Promise<StorageData> => {
        const result = await chrome.storage.local.get(null) as any;

        // --- MIGRATION LOGIC: Upgrade old data to Workspace format ---
        if (!result.workspaces || result.workspaces.length === 0) {
            console.log("Gemini Project Manager: Migrating to Workspaces...");

            // If it's a completely fresh install (no folders), just return default data structure
            // But if we have folders/chats, we need to preserve them in a default workspace.
            const hasData = (result.folders && result.folders.length > 0);

            // !result.folders check catches the very first load vs empty array
            // check for chats existence safely
            const hasChats = result.chats && Object.keys(result.chats).length > 0;

            if (hasData || hasChats || !result.folders) {
                const defaultId = crypto.randomUUID();
                const defaultWorkspace: Workspace = {
                    id: defaultId,
                    name: 'Main Workspace',
                    order: 0
                };

                // If we have existing folders, assign them to this new workspace
                const existingFolders = (result.folders as Folder[]) || [];
                const migratedFolders = existingFolders.map(f => ({
                    ...f,
                    workspaceId: f.workspaceId || defaultId // Assign if missing
                }));

                const migratedData: StorageData = {
                    chats: (result.chats || {}) as Record<string, Chat>,
                    snippets: [],
                    settings: (result.settings || { theme: 'dark' }) as { theme: 'dark' | 'light' },
                    workspaces: [defaultWorkspace],
                    activeWorkspaceId: defaultId,
                    folders: migratedFolders
                };

                // Save immediately so we don't migrate again
                await chrome.storage.local.set(migratedData);
                return migratedData;
            } else {
                // Fresh install, just return empty structure with empty workspaces
                return DEFAULT_DATA;
            }
        }
        // -------------------------------------------------------------

        return result as StorageData;
    },

    save: async (data: Partial<StorageData>) => {
        await chrome.storage.local.set(data);
    },

    // NEW: Update Chat Content
    updateChatContent: async (chatId: string, content: string, turnCount: number) => {
        const data = await storage.get();
        const chat = data.chats[chatId];

        if (!chat) return; // Chat must exist first

        const updatedChat = {
            ...chat,
            content,
            turnCount,
            lastSynced: Date.now()
        };

        const updatedChats = { ...data.chats, [chatId]: updatedChat };
        await storage.save({ chats: updatedChats });
    },

    // --- WORKSPACE OPERATIONS ---
    addWorkspace: async (name: string) => {
        const data = await storage.get();
        const newWorkspace: Workspace = {
            id: crypto.randomUUID(),
            name,
            order: data.workspaces.length
        };
        await storage.save({
            workspaces: [...data.workspaces, newWorkspace],
            activeWorkspaceId: newWorkspace.id // Auto-switch to new
        });
    },

    deleteWorkspace: async (id: string) => {
        const data = await storage.get();
        if (data.workspaces.length <= 1) return; // Prevent deleting the last one

        const remainingWorkspaces = data.workspaces.filter(w => w.id !== id);
        // Delete all folders in this workspace
        const remainingFolders = data.folders.filter(f => f.workspaceId !== id);

        // If we deleted the active one, switch to the first available
        let newActiveId = data.activeWorkspaceId;
        if (id === data.activeWorkspaceId) {
            newActiveId = remainingWorkspaces[0].id;
        }

        await storage.save({
            workspaces: remainingWorkspaces,
            folders: remainingFolders,
            activeWorkspaceId: newActiveId
        });
    },

    setActiveWorkspace: async (id: string) => {
        await storage.save({ activeWorkspaceId: id });
    },

    // --- NEW: Backup & Restore Utilities ---
    exportData: async () => {
        const data = await storage.get();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gemini-projects-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    importData: async (jsonString: string): Promise<boolean> => {
        try {
            const data = JSON.parse(jsonString);
            if (!Array.isArray(data.folders) || typeof data.chats !== 'object') {
                throw new Error('Invalid backup file format');
            }
            // Ensure imported data respects new schema
            if (!data.workspaces) {
                // If importing old data, wrap it in a default workspace
                const defaultId = crypto.randomUUID();
                data.workspaces = [{ id: defaultId, name: 'Imported Workspace', order: 0 }];
                data.activeWorkspaceId = defaultId;
                data.folders = data.folders.map((f: any) => ({ ...f, workspaceId: defaultId }));
            }
            await storage.save(data);
            return true;
        } catch (e) {
            console.error('Gemini Project Manager: Import failed', e);
            alert('Failed to import data. Please check the file.');
            return false;
        }
    },

    // Helper to clear everything (useful for debugging or reset)
    clearAll: async () => {
        await chrome.storage.local.clear();
    },
    // ---------------------------------------

    addFolder: async (name: string, workspaceId: string, parentId: string | null = null) => {
        const data = await storage.get();
        const newFolder: Folder = {
            id: crypto.randomUUID(),
            workspaceId, // Link to workspace
            name,
            parentId, // <--- Link to parent
            chatIds: [],
            collapsed: false,
        };
        const updatedFolders = [...data.folders, newFolder];
        await storage.save({ folders: updatedFolders });
        return newFolder;
    },

    // NEW: Handle Drag & Drop nesting
    moveFolder: async (folderId: string, newParentId: string | null) => {
        const data = await storage.get();
        // Validation: Prevent circular dependency (folder cannot be its own child)
        if (folderId === newParentId) return;

        // Validation: Prevent moving a folder into its own descendant
        const isDescendant = (parentId: string | null, targetId: string): boolean => {
            if (!parentId) return false;
            if (parentId === targetId) return true;
            const parent = data.folders.find(f => f.id === parentId);
            return parent ? isDescendant(parent.parentId, targetId) : false;
        };

        if (newParentId && isDescendant(newParentId, folderId)) {
            console.warn("Gemini Project Manager: Cannot move folder into its own descendant");
            return;
        }

        const updatedFolders = data.folders.map(f =>
            f.id === folderId ? { ...f, parentId: newParentId } : f
        );
        await storage.save({ folders: updatedFolders });
    },

    deleteFolder: async (folderId: string) => {
        const data = await storage.get();

        // Helper to find all descendant IDs
        const getDescendants = (pid: string, list: Folder[]): string[] => {
            const children = list.filter(f => f.parentId === pid);
            let ids = children.map(c => c.id);
            children.forEach(child => {
                ids = [...ids, ...getDescendants(child.id, list)];
            });
            return ids;
        };

        const idsToDelete = [folderId, ...getDescendants(folderId, data.folders)];

        // Remove all identified folders
        const updatedFolders = data.folders.filter(f => !idsToDelete.includes(f.id));
        await storage.save({ folders: updatedFolders });
    },

    addChatToFolder: async (chat: Chat, folderId: string) => {
        return withStorageLock(async () => {
            console.log(`Gemini Project Manager: Storage.addChatToFolder called for chat "${chat.title}" (${chat.id}) to folder ${folderId}`);

            const data = await storage.get();
            const folderIndex = data.folders.findIndex(f => f.id === folderId);

            if (folderIndex === -1) {
                console.error(`Gemini Project Manager: Folder ${folderId} NOT FOUND inside storage.get()`);
                return;
            }

            const folder = data.folders[folderIndex];
            console.log(`Gemini Project Manager: Found folder "${folder.name}". Current chats: [${folder.chatIds.join(', ')}]`);

            // Save chat metadata if not exists or update it
            const updatedChats = { ...data.chats, [chat.id]: chat };

            // Check if chat is already in folder
            if (!folder.chatIds.includes(chat.id)) {
                console.log(`Gemini Project Manager: Chat ${chat.id} is NEW to this folder. Adding...`);

                const updatedFolder = { ...folder, chatIds: [...folder.chatIds, chat.id] };
                const updatedFolders = [...data.folders];
                updatedFolders[folderIndex] = updatedFolder;

                await storage.save({ folders: updatedFolders, chats: updatedChats });
                console.log(`Gemini Project Manager: Save complete. New chat count: ${updatedFolder.chatIds.length}`);
            } else {
                console.warn(`Gemini Project Manager: Chat ${chat.id} ALREADY EXISTS in folder. Updating metadata only.`);
                await storage.save({ chats: updatedChats });
            }
        });
    },

    removeChatFromFolder: async (chatId: string, folderId: string) => {
        const data = await storage.get();
        const folderIndex = data.folders.findIndex(f => f.id === folderId);
        if (folderIndex === -1) return;

        const folder = data.folders[folderIndex];
        const updatedChatIds = folder.chatIds.filter(id => id !== chatId);

        const updatedFolder = { ...folder, chatIds: updatedChatIds };
        const updatedFolders = [...data.folders];
        updatedFolders[folderIndex] = updatedFolder;

        await storage.save({ folders: updatedFolders });
    },

    moveChat: async (chatId: string, fromFolderId: string, toFolderId: string) => {
        const data = await storage.get();
        const fromFolderIndex = data.folders.findIndex(f => f.id === fromFolderId);
        const toFolderIndex = data.folders.findIndex(f => f.id === toFolderId);

        if (fromFolderIndex === -1 || toFolderIndex === -1) return;

        const fromFolder = data.folders[fromFolderIndex];
        const toFolder = data.folders[toFolderIndex];

        const newFromChatIds = fromFolder.chatIds.filter(id => id !== chatId);
        const newToChatIds = [...toFolder.chatIds, chatId];

        const updatedFolders = [...data.folders];
        updatedFolders[fromFolderIndex] = { ...fromFolder, chatIds: newFromChatIds };
        updatedFolders[toFolderIndex] = { ...toFolder, chatIds: newToChatIds };

        await storage.save({ folders: updatedFolders });
    },

    // --- FEATURE 1: SNIPPETS ---
    addSnippet: async (title: string, content: string) => {
        const data = await storage.get();
        const newSnippet: Snippet = {
            id: crypto.randomUUID(),
            title,
            content,
            timestamp: Date.now()
        };
        // Ensure snippets array exists (migration safety)
        const snippets = data.snippets || [];
        await storage.save({ snippets: [...snippets, newSnippet] });
    },

    deleteSnippet: async (id: string) => {
        const data = await storage.get();
        const snippets = (data.snippets || []).filter(s => s.id !== id);
        await storage.save({ snippets });
    },

    // --- FEATURE 2: TAGS ---
    updateChatTags: async (chatId: string, tags: string[]) => {
        const data = await storage.get();
        const chat = data.chats[chatId];
        if (!chat) return;

        const updatedChat = { ...chat, tags };
        const updatedChats = { ...data.chats, [chatId]: updatedChat };
        await storage.save({ chats: updatedChats });
    },

    toggleChatPin: async (chatId: string) => {
        const data = await storage.get();
        const chat = data.chats[chatId];
        if (!chat) return;

        const updatedChat = { ...chat, pinned: !chat.pinned };
        await storage.save({ chats: { ...data.chats, [chatId]: updatedChat } });
    },

    clearAllPins: async () => {
        const data = await storage.get();
        const updatedChats = { ...data.chats };

        for (const chatId of Object.keys(updatedChats)) {
            if (updatedChats[chatId].pinned) {
                updatedChats[chatId] = { ...updatedChats[chatId], pinned: false };
            }
        }

        await storage.save({ chats: updatedChats });
    },

    // --- FEATURE 5: WORKSPACE DEFAULTS ---
    updateWorkspaceDefaultPrompt: async (workspaceId: string, prompt: string) => {
        const data = await storage.get();
        const workspaces = data.workspaces.map(w =>
            w.id === workspaceId ? { ...w, defaultPrompt: prompt } : w
        );
        await storage.save({ workspaces });
    },

    // --- API KEY STORAGE ---
    getApiKey: async (): Promise<string | null> => {
        const result = await chrome.storage.local.get('geminiApiKey') as { geminiApiKey?: string };
        return result.geminiApiKey || null;
    },

    setApiKey: async (apiKey: string) => {
        await chrome.storage.local.set({ geminiApiKey: apiKey });
    },

    getGithubToken: async (): Promise<string | undefined> => {
        const result = await chrome.storage.local.get('githubToken') as { githubToken?: string };
        return result.githubToken;
    },

    setGithubToken: async (token: string): Promise<void> => {
        await chrome.storage.local.set({ githubToken: token });
    },

    // --- RECENT REPOS ---
    getRecentRepos: async (): Promise<string[]> => {
        const data = await storage.get();
        return data.recentRepos || [];
    },

    addRecentRepo: async (repoUrl: string) => {
        const data = await storage.get();
        let current = data.recentRepos || [];

        // Remove if exists (to bump to top)
        current = current.filter(url => url !== repoUrl);

        // Add to front
        current.unshift(repoUrl);

        // Limit to 10
        current = current.slice(0, 10);

        await storage.save({ recentRepos: current });
    }
};
