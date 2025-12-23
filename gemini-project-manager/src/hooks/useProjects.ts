import { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import type { Folder, Chat, Workspace } from '../types';

export function useProjects() {
    const [folders, setFolders] = useState<Folder[]>([]);
    const [chats, setChats] = useState<Record<string, Chat>>({});
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]); // NEW
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(''); // NEW
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        const data = await storage.get();
        setFolders(data.folders);
        setChats(data.chats || {});
        setWorkspaces(data.workspaces || []);
        setActiveWorkspaceId(data.activeWorkspaceId || '');
        setLoading(false);
    };

    useEffect(() => {
        refresh();
        const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            // Refresh on any relevant change
            if (changes.folders || changes.chats || changes.workspaces || changes.activeWorkspaceId) {
                refresh();
            }
        };
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    const addFolder = async (name: string) => {
        // Use current active ID
        if (activeWorkspaceId) {
            await storage.addFolder(name, activeWorkspaceId);
            refresh();
        }
    };

    const deleteFolder = async (id: string) => {
        await storage.deleteFolder(id);
        refresh();
    };

    const addChatToFolder = async (folderId: string, chat: Chat) => {
        await storage.addChatToFolder(chat, folderId);
        refresh();
    };

    const importData = async (json: string) => {
        const success = await storage.importData(json);
        if (success) refresh();
    };

    // --- NEW WORKSPACE ACTIONS ---
    const addWorkspace = async (name: string) => {
        await storage.addWorkspace(name);
        refresh();
    };

    const deleteWorkspace = async (id: string) => {
        await storage.deleteWorkspace(id);
        refresh();
    };

    const setActiveWorkspace = async (id: string) => {
        await storage.setActiveWorkspace(id);
        // Optimistic update
        setActiveWorkspaceId(id);
        refresh();
    };

    return {
        folders,
        chats,
        workspaces,
        activeWorkspaceId,
        loading,
        addFolder,
        deleteFolder,
        addChatToFolder,
        refresh,
        importData,
        addWorkspace,
        deleteWorkspace,
        setActiveWorkspace
    };
}
