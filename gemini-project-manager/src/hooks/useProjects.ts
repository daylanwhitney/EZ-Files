import { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import type { Folder, Chat } from '../types';

export function useProjects() {
    const [folders, setFolders] = useState<Folder[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        const data = await storage.get();
        setFolders(data.folders);
        setLoading(false);
    };

    useEffect(() => {
        refresh();

        // Optional: Listen for storage changes if multiple tabs open
        const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            if (changes.folders) {
                refresh();
            }
        };
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    const addFolder = async (name: string) => {
        await storage.addFolder(name);
        refresh();
    };

    const deleteFolder = async (id: string) => {
        await storage.deleteFolder(id);
        refresh();
    };

    const addChatToFolder = async (folderId: string, chat: Chat) => {
        await storage.addChatToFolder(chat, folderId);
        refresh();
    };

    return { folders, loading, addFolder, deleteFolder, addChatToFolder, refresh };
}
