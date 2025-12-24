import type { Folder, Chat, StorageData, Workspace } from '../types';

const DEFAULT_DATA: StorageData = {
    workspaces: [],
    activeWorkspaceId: '',
    folders: [],
    chats: {},
    settings: { theme: 'dark' },
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

    addFolder: async (name: string, workspaceId: string) => {
        const data = await storage.get();
        const newFolder: Folder = {
            id: crypto.randomUUID(),
            workspaceId, // Link to workspace
            name,
            parentId: null,
            chatIds: [],
            collapsed: false,
        };
        const updatedFolders = [...data.folders, newFolder];
        await storage.save({ folders: updatedFolders });
        return newFolder;
    },

    deleteFolder: async (folderId: string) => {
        // Recursive delete logic would go here (or just move children to root)
        // For now, simple delete
        const data = await storage.get();
        const updatedFolders = data.folders.filter(f => f.id !== folderId);
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
    }
};
