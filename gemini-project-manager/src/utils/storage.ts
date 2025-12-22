import type { Folder, Chat, StorageData } from '../types';

const DEFAULT_DATA: StorageData = {
    folders: [],
    chats: {},
    settings: { theme: 'dark' },
};

export const storage = {
    get: async (): Promise<StorageData> => {
        const result = await chrome.storage.local.get(null);
        if (!result.folders) {
            return DEFAULT_DATA;
        }
        return result as unknown as StorageData;
    },

    save: async (data: Partial<StorageData>) => {
        await chrome.storage.local.set(data);
    },

    addFolder: async (name: string, parentId: string | null = null) => {
        const data = await storage.get();
        const newFolder: Folder = {
            id: crypto.randomUUID(),
            name,
            parentId,
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
        const data = await storage.get();

        // Save chat metadata if not exists or update it
        const updatedChats = { ...data.chats, [chat.id]: chat };

        // Add ref to folder
        const folderIndex = data.folders.findIndex(f => f.id === folderId);
        if (folderIndex === -1) return;

        const folder = data.folders[folderIndex];
        if (!folder.chatIds.includes(chat.id)) {
            const updatedFolder = { ...folder, chatIds: [...folder.chatIds, chat.id] };
            const updatedFolders = [...data.folders];
            updatedFolders[folderIndex] = updatedFolder;
            await storage.save({ folders: updatedFolders, chats: updatedChats });
        } else {
            // Just update chat metadata
            await storage.save({ chats: updatedChats });
        }
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
