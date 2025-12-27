import { useState, useEffect, useRef } from 'react';
import { Trash2, MessageSquare, Plus, Folder as FolderIcon, ChevronRight, ChevronDown, Pencil, Search, FileDown, Tag, Pin } from 'lucide-react';
import FolderChat from './FolderChat';
import { useProjects } from '../hooks/useProjects';
import { useActiveChat } from '../hooks/useActiveChat';
import type { Folder, Chat, StorageData } from '../types';
import { storage } from '../utils/storage';

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface ProjectListProps {
    isSidePanel?: boolean;
    currentUrl?: string;
}

// Helper to build path string for search results
const getFolderPath = (folder: Folder, allFolders: Folder[]): string => {
    if (!folder.parentId) return folder.name;
    const parent = allFolders.find(f => f.id === folder.parentId);
    return parent ? `${getFolderPath(parent, allFolders)} / ${folder.name}` : folder.name;
};

// Helper: Get all chat IDs recursively from a folder and its subfolders
const getRecursiveChatIds = (folderId: string, allFolders: Folder[]): string[] => {
    const folder = allFolders.find(f => f.id === folderId);
    if (!folder) return [];

    let ids = [...folder.chatIds];

    // Find children
    const children = allFolders.filter(f => f.parentId === folderId);
    children.forEach(child => {
        ids = [...ids, ...getRecursiveChatIds(child.id, allFolders)];
    });

    // Deduplicate
    return Array.from(new Set(ids));
};

export default function ProjectList({ isSidePanel = false, currentUrl }: ProjectListProps) {
    const { folders, chats, activeWorkspaceId, loading, addFolder, moveFolder, deleteFolder, addChatToFolder, refresh } = useProjects();
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // --- Active Chat Detection ---
    let urlChatId: string | null = null;
    if (currentUrl) {
        const match = currentUrl.match(/\/app\/([a-zA-Z0-9_-]+)/);
        if (match) urlChatId = match[1];
    }
    const { activeTitle } = useActiveChat(isSidePanel);
    let activeChatId = urlChatId;

    if (!activeChatId && activeTitle) {
        const normalize = (s: string) => s.toLowerCase().trim().replace(/[^\w\s]/g, '');
        activeChatId = Object.keys(chats).find(key => {
            const chat = chats[key];
            if (!chat.title) return false;
            const storedNorm = normalize(chat.title);
            const activeNorm = normalize(activeTitle);
            if (storedNorm === activeNorm) return true;
            if (storedNorm.includes(activeNorm) || activeNorm.includes(storedNorm)) return true;
            const minLen = Math.min(storedNorm.length, activeNorm.length, 20);
            return minLen >= 5 && storedNorm.substring(0, minLen) === activeNorm.substring(0, minLen);
        }) || null;
    }

    const handleCreate = async () => {
        if (!newFolderName.trim()) return;
        // Top level folder creation
        await addFolder(newFolderName, null);
        setNewFolderName('');
        setIsCreating(false);
    };

    // --- Search & Filtering Logic ---
    const workspaceFolders = folders.filter(f => f.workspaceId === activeWorkspaceId);

    // Default: Show Only Roots
    let displayFolders: (Folder & { _forceExpand?: boolean; _breadcrumbs?: string })[] = workspaceFolders.filter(f => f.parentId === null);

    // Search Mode: Flat List of MATCHES + Breadcrumbs
    if (searchQuery.trim()) {
        const isTagSearch = searchQuery.startsWith('#');
        const query = isTagSearch ? searchQuery.slice(1).toLowerCase() : searchQuery.toLowerCase();

        displayFolders = workspaceFolders.map(folder => {
            // 1. Name Match
            let matches = !isTagSearch && folder.name.toLowerCase().includes(query);

            // 2. Chat Match
            const matchingChatIds = folder.chatIds.filter(chatId => {
                const chat = chats[chatId];
                if (!chat) return false;
                if (isTagSearch) {
                    return chat.tags?.some(t => t.toLowerCase().includes(query));
                } else {
                    return chat.title.toLowerCase().includes(query);
                }
            });

            if (matches || matchingChatIds.length > 0) {
                return {
                    ...folder,
                    // If folder matches, show all. If only chats match, filter them.
                    chatIds: matches ? folder.chatIds : matchingChatIds,
                    _forceExpand: true,
                    _breadcrumbs: getFolderPath(folder, workspaceFolders)
                };
            }
            return null;
        }).filter(Boolean) as any;
    }

    if (loading) return <div className="p-4 text-gray-400 text-sm">Loading projects...</div>;

    return (
        <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Search Bar */}
            <div className="px-4 py-2 border-b border-gray-700 bg-[#1e1f20] sticky top-0 z-10">
                <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search projects & chats..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-800 text-gray-200 text-xs py-2 pl-8 pr-2 rounded border border-gray-700 focus:border-blue-500 focus:outline-none placeholder-gray-500"
                    />
                </div>
            </div>

            {/* Create Button (only show if not searching) */}
            {!searchQuery && (
                isCreating ? (
                    <div className="p-2 mx-2 my-2 bg-gray-800 rounded border border-gray-600">
                        <input
                            autoFocus
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            placeholder="Project Name..."
                            className="w-full bg-transparent text-white text-sm focus:outline-none"
                        />
                    </div>
                ) : (
                    <div className="px-4 pt-2 pb-1">
                        <button
                            onClick={() => setIsCreating(true)}
                            className="w-full flex items-center gap-2 text-gray-400 hover:text-white text-sm py-1.5 px-2 rounded hover:bg-gray-800 transition-colors"
                        >
                            <Plus size={14} />
                            <span>New Project</span>
                        </button>
                    </div>
                )
            )}

            {/* Folder List */}
            <div className="space-y-0.5 px-2 mt-1">
                {displayFolders.map(folder => (
                    <div key={folder.id}>
                        {/* Search Breadcrumbs */}
                        {folder._breadcrumbs && (folder._breadcrumbs !== folder.name) && (
                            <div className="text-[10px] text-gray-500 mb-0.5 pl-2">
                                {folder._breadcrumbs}
                            </div>
                        )}

                        <FolderItem
                            folder={folder}
                            allFolders={workspaceFolders} // Recursive Context
                            allChats={chats}
                            activeChatId={activeChatId}
                            forceExpand={folder._forceExpand}
                            onDelete={() => deleteFolder(folder.id)}
                            onAddChat={addChatToFolder}
                            onRefresh={refresh}
                            onRemoveChat={async (chatId) => {
                                await storage.removeChatFromFolder(chatId, folder.id);
                                refresh();
                            }}
                            onMoveFolder={moveFolder}
                            onAddSubfolder={(parentId) => {
                                const name = prompt("Enter subfolder name:", "New Folder");
                                if (name && name.trim()) addFolder(name.trim(), parentId);
                            }}
                            isSidePanel={isSidePanel}
                            currentUrl={currentUrl}
                            isSearchMode={!!searchQuery}
                        />
                    </div>
                ))}

                {displayFolders.length === 0 && (
                    <div className="text-xs text-gray-500 text-center py-4">
                        {searchQuery ? 'No results found.' : 'No projects yet.'}
                    </div>
                )}
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------

interface FolderItemProps {
    folder: Folder;
    allFolders: Folder[];
    allChats: Record<string, Chat>;
    activeChatId: string | null;
    forceExpand?: boolean;
    onDelete: () => void;
    onAddChat: (folderId: string, chat: any) => void;
    onRefresh: () => void;
    onRemoveChat: (chatId: string) => void;
    onMoveFolder: (folderId: string, newParentId: string | null) => void;
    onAddSubfolder: (parentId: string) => void;
    isSidePanel?: boolean;
    currentUrl?: string;
    isSearchMode?: boolean;
}

function FolderItem({
    folder, allFolders, allChats, activeChatId, forceExpand,
    onDelete, onAddChat, onRefresh, onRemoveChat, onMoveFolder, onAddSubfolder,
    isSidePanel, currentUrl, isSearchMode
}: FolderItemProps) {

    // Identification
    const childFolders = allFolders.filter(f => f.parentId === folder.id);

    // Auto-expand logic
    // Check if active chat is in THIS folder OR in any descendants
    const hasActiveChatInTree = (fid: string): boolean => {
        if (!activeChatId) return false;
        const f = allFolders.find(x => x.id === fid);
        if (f?.chatIds.includes(activeChatId)) return true;
        const children = allFolders.filter(x => x.parentId === fid);
        return children.some(c => hasActiveChatInTree(c.id));
    };

    const shouldBeExpanded = forceExpand || hasActiveChatInTree(folder.id);
    const [isExpanded, setIsExpanded] = useState(folder.collapsed ? false : true);

    useEffect(() => {
        if (shouldBeExpanded) setIsExpanded(true);
    }, [shouldBeExpanded, folder.id]);

    const folderChats = folder.chatIds.map(id => allChats[id]).filter(Boolean);
    const totalChats = folderChats.length;
    const syncedChats = folderChats.filter(c => c.content && c.content.length > 0).length;
    const isFullySynced = totalChats > 0 && totalChats === syncedChats;

    // Chat Logic
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<{ id: string, role: 'user' | 'assistant', text: string, timestamp: number }[]>([]);
    const [isChatLoading, setIsChatLoading] = useState(false);

    const handleChatWithFolder = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsChatOpen(!isChatOpen);
    };

    const handleSendMessage = async (text: string) => {
        const userMsg = { id: Date.now().toString(), role: 'user' as const, text, timestamp: Date.now() };
        setChatMessages(prev => [...prev, userMsg]);
        setIsChatLoading(true);

        try {
            // RECURSIVE CONTEXT AGGREGATION
            const recursiveChatIds = getRecursiveChatIds(folder.id, allFolders);
            const allRecursiveChats = recursiveChatIds.map(id => allChats[id]).filter(Boolean);

            let context = "";
            if (chatMessages.length === 0) {
                context = `CONTEXT FROM FOLDER TREE: "${folder.name}" (${allRecursiveChats.length} chats)\n\n`;
                allRecursiveChats.forEach((chat: Chat) => {
                    if (chat.content) {
                        context += `--- START CHAT: ${chat.title} ---\n${chat.content}\n--- END CHAT ---\n\n`;
                    }
                });
            }

            // Get workspace persona
            const storageData = await storage.get();
            const workspace = storageData.workspaces.find(w => w.id === folder.workspaceId);
            const workspacePrompt = workspace?.defaultPrompt;

            const response = await chrome.runtime.sendMessage({
                type: 'CMD_FOLDER_CHAT_SEND',
                folderId: folder.id,
                text,
                context: context ? context : undefined,
                workspacePrompt: workspacePrompt || undefined
            });

            if (response && response.success) {
                const aiMsg = { id: (Date.now() + 1).toString(), role: 'assistant' as const, text: response.text, timestamp: Date.now() };
                setChatMessages(prev => [...prev, aiMsg]);
            } else {
                setChatMessages(prev => [...prev, { id: 'err', role: 'assistant', text: "Error: " + (response?.error || "Failed"), timestamp: Date.now() }]);
            }

        } catch (err) {
            console.error(err);
            setChatMessages(prev => [...prev, { id: 'err', role: 'assistant', text: "Error: Extension communication failed.", timestamp: Date.now() }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(folder.name);
    const [isDragOver, setIsDragOver] = useState(false);
    const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSaveResize = async () => {
        if (!editName.trim()) return;
        const data = await storage.get();
        const updatedFolders = data.folders.map(f => f.id === folder.id ? { ...f, name: editName } : f);
        await storage.save({ folders: updatedFolders });
        setIsEditing(false);
        onRefresh();
    };

    const handleDelete = () => {
        if (confirm(`Delete "${folder.name}" and all subfolders?`)) {
            onDelete();
        }
    };

    const handleExport = () => {
        // RECURSIVE EXPORT
        const recursiveChatIds = getRecursiveChatIds(folder.id, allFolders);
        const allRecursiveChats = recursiveChatIds.map(id => allChats[id]).filter(Boolean);

        let md = `# Folder Tree: ${folder.name}\n\n`;
        allRecursiveChats.forEach(chat => {
            md += `## ${chat.title}\n\n${chat.content || '(No content synced)'}\n\n---\n\n`;
        });
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${folder.name.replace(/\s+/g, '_')}-tree-report.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // --- Drag and Drop Handlers ---
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('ez-files/folder-id', folder.id);
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragOver) setIsDragOver(true);
        if (!isExpanded && !expandTimerRef.current) {
            expandTimerRef.current = setTimeout(() => setIsExpanded(true), 600);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragOver(false);
        if (expandTimerRef.current) {
            clearTimeout(expandTimerRef.current);
            expandTimerRef.current = null;
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (expandTimerRef.current) {
            clearTimeout(expandTimerRef.current);
            expandTimerRef.current = null;
        }

        const folderDragId = e.dataTransfer.getData('ez-files/folder-id');

        // CASE 1: Dropping a Folder
        if (folderDragId) {
            // Cannot drop onto self
            if (folderDragId === folder.id) return;
            // Move folder logic
            onMoveFolder(folderDragId, folder.id);
            return;
        }

        // CASE 2: Dropping a Chat
        try {
            const json = e.dataTransfer.getData('application/json');
            if (json) {
                const data = JSON.parse(json);
                if (data.id && data.title) {
                    onAddChat(folder.id, data);
                    // Indexing logic omitted for brevity, assumed handled by storage or main sync loop
                    // But if we want to trigger indexing immediately:
                    const existingChat = allChats[data.id];
                    if (!existingChat || !existingChat.content) {
                        chrome.runtime.sendMessage({ type: 'CMD_INDEX_CHAT', chatId: data.id, title: data.title });
                    }
                }
            } else {
                // URL Fallback
                const url = e.dataTransfer.getData('text/plain');
                if (url && url.includes('/app/')) {
                    const idMatch = url.match(/\/app\/([a-zA-Z0-9_-]+)/);
                    if (idMatch) {
                        onAddChat(folder.id, { id: idMatch[1], title: "Dropped Chat", url: url, timestamp: Date.now() });
                    }
                }
            }
        } catch (err) {
            console.error("Drop failed:", err);
        }
    };

    return (
        <div
            className={`border-l-2 ml-1 ${isSearchMode ? 'border-transparent' : 'border-transparent'}`} // Indentation guide container
        >
            <div
                className={`group rounded mb-0.5 ${isDragOver ? 'bg-gray-800 ring-1 ring-blue-500' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                draggable={!isEditing && !isSearchMode} // Only draggable if not searching
                onDragStart={handleDragStart}
            >
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800 text-gray-300 hover:text-white group-hover:bg-opacity-80 transition-colors ${isDragOver ? 'bg-gray-800' : ''}`}>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className={`p-0.5 hover:bg-gray-700 rounded text-gray-500 ${(childFolders.length === 0 && folder.chatIds.length === 0) ? 'invisible' : ''}`}
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    <div className="flex-1 flex items-center gap-2 min-w-0" onDoubleClick={() => setIsEditing(true)}>
                        <FolderIcon size={16} className={`text-blue-400 flex-shrink-0 ${isDragOver ? 'scale-110 transition-transform' : ''}`} />
                        {isEditing ? (
                            <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                className="bg-gray-900 text-white text-sm w-full focus:outline-none px-1 rounded"
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleSaveResize()}
                                onBlur={handleSaveResize}
                                onClick={e => e.stopPropagation()}
                            />
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="text-sm truncate select-none cursor-pointer">{folder.name}</span>
                                {totalChats > 0 && (
                                    <span className={`text-[10px] px-1 rounded ${isFullySynced ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`} title={`${syncedChats}/${totalChats} chats indexed`}>
                                        {syncedChats}/{totalChats}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {!isEditing && (
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} className="p-1 hover:text-blue-400 rounded transition-all" title="Rename"><Pencil size={12} /></button>
                            <button onClick={handleChatWithFolder} className={`p-1 rounded transition-all ${isChatOpen ? 'text-blue-400' : 'hover:text-blue-400 hover:bg-gray-700'}`} title="Chat with Folder Tree"><MessageSquare size={12} /></button>
                            <button onClick={handleExport} className="p-1 hover:text-green-400 hover:bg-gray-700 rounded transition-all" title="Export Tree"><FileDown size={12} /></button>
                            <button onClick={(e) => { e.stopPropagation(); onAddSubfolder(folder.id); setIsExpanded(true); }} className="p-1 hover:text-yellow-400 hover:bg-gray-700 rounded transition-all relative" title="New Subfolder">
                                <FolderIcon size={12} />
                                <Plus size={8} className="absolute -bottom-0.5 -right-0.5 bg-gray-900 rounded-full" />
                            </button>

                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    // Quick Add Current Chat Logic (Duplicated for availability)
                                    let url = isSidePanel && currentUrl ? currentUrl : window.location.href;
                                    let title = 'Untitled Chat';
                                    let chatIdFromUrl = null;
                                    if (isSidePanel) {
                                        try {
                                            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                                            if (tab?.id) {
                                                const response = await chrome.tabs.sendMessage(tab.id, { type: 'CMD_GET_CURRENT_CHAT_INFO' });
                                                if (response) { if (response.title) title = response.title; if (response.url) url = response.url; }
                                                else { if (tab.title) title = tab.title.replace(/ - Google Gemini$/, ''); if (tab.url) url = tab.url; }
                                            }
                                        } catch (err) { }
                                    } else { url = window.location.href; title = getGeminiTitle(); }
                                    const match = url.match(/\/app\/([a-zA-Z0-9]+)/);
                                    if (match) chatIdFromUrl = match[1];
                                    if (chatIdFromUrl) { onAddChat(folder.id, { id: chatIdFromUrl, title, url, timestamp: Date.now() }); }
                                    else { alert("No active chat found."); }
                                }}
                                className="p-1 hover:bg-gray-700 hover:text-green-400 rounded transition-all"
                                title="Add Current Chat"
                            >
                                <Plus size={12} />
                            </button>

                            <button onClick={(e) => { e.stopPropagation(); handleDelete(); }} className="p-1 hover:bg-red-900/50 hover:text-red-400 rounded transition-all" title="Delete Folder"><Trash2 size={12} /></button>
                        </div>
                    )}
                </div >

                {/* Folder Chat Interface */}
                {isChatOpen && (
                    <FolderChat
                        folderName={folder.name}
                        folderId={folder.id}
                        onClose={() => { setIsChatOpen(false); chrome.runtime.sendMessage({ type: 'CMD_CLOSE_FOLDER_CHAT', folderId: folder.id }).catch(() => { }); }}
                        messages={chatMessages}
                        onSendMessage={handleSendMessage}
                        isLoading={isChatLoading}
                    />
                )}

                {
                    isExpanded && (
                        <div className={`ml-4 pl-2 space-y-0.5 ${isDragOver ? 'pointer-events-none' : ''}`}>
                            {/* RECURSION: Subfolders First */}
                            {childFolders.map(child => (
                                <FolderItem
                                    key={child.id}
                                    folder={child}
                                    allFolders={allFolders}
                                    allChats={allChats}
                                    activeChatId={activeChatId}
                                    forceExpand={forceExpand}
                                    onDelete={() => onDelete()} // Should probably call distinct delete for child
                                    // FIX: We need to pass the REAL recursive handlers here
                                    onAddChat={onAddChat}
                                    onRefresh={onRefresh}
                                    onRemoveChat={onRemoveChat}
                                    onMoveFolder={onMoveFolder}
                                    onAddSubfolder={onAddSubfolder}
                                    isSidePanel={isSidePanel}
                                    currentUrl={currentUrl}
                                    isSearchMode={isSearchMode}
                                />
                            ))}

                            {/* Then Chats */}
                            {folder.chatIds.length === 0 && childFolders.length === 0 ? (
                                <div className="text-[10px] text-gray-600 italic py-1">Empty</div>
                            ) : (
                                folder.chatIds.map(chatId => (
                                    <ChatItem
                                        key={chatId}
                                        chatId={chatId}
                                        chatData={allChats[chatId]}
                                        isActive={chatId === activeChatId}
                                        onRemove={() => onRemoveChat(chatId)}
                                        isSidePanel={isSidePanel}
                                    />
                                ))
                            )}
                        </div>
                    )
                }
            </div>
        </div>
    );
}

function ChatItem({ chatId, chatData, isActive, onRemove, isSidePanel }: {
    chatId: string;
    chatData?: Chat;
    isActive: boolean;
    onRemove: () => void;
    isSidePanel?: boolean;
}) {
    const [localChat, setLocalChat] = useState<Chat | null>(chatData || null);

    useEffect(() => {
        if (chatData) {
            setLocalChat(chatData);
        } else {
            chrome.storage.local.get(['chats']).then((res) => {
                const result = res as unknown as StorageData;
                if (result.chats && result.chats[chatId]) {
                    setLocalChat(result.chats[chatId]);
                }
            });
        }
    }, [chatId, chatData]);

    const handleNavigation = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        let targetUrl = localChat?.url;
        if (!targetUrl && chatId) targetUrl = `https://gemini.google.com/app/${chatId}`;
        if (!targetUrl) return;

        if (isSidePanel) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
                if (chatId && tab.url && tab.url.includes(`/app/${chatId}`)) return;
                try {
                    await chrome.tabs.sendMessage(tab.id, { type: 'CMD_OPEN_CHAT', chatId, url: targetUrl, title: localChat?.title || '' });
                } catch (err) {
                    chrome.tabs.update(tab.id, { url: targetUrl });
                }
            }
        } else {
            window.location.href = targetUrl;
        }
    };

    const handleEditTags = async () => {
        const currentTags = localChat?.tags?.join(', ') || '';
        const newTagsStr = prompt("Tags:", currentTags);
        if (newTagsStr !== null) {
            const tags = newTagsStr.split(',').map(t => t.trim()).filter(Boolean);
            await storage.updateChatTags(chatId, tags);
            if (localChat) setLocalChat({ ...localChat, tags });
        }
    };

    const handleTogglePin = async () => {
        await storage.toggleChatPin(chatId);
        if (localChat) setLocalChat({ ...localChat, pinned: !localChat.pinned });
    };

    if (!localChat) return <div className="text-xs text-gray-500 py-0.5 px-2">Loading...</div>;

    return (
        <div
            className={cn(
                "group flex items-center justify-between text-xs py-1 px-2 rounded transition-colors cursor-pointer",
                isActive
                    ? "bg-blue-900/40 text-blue-200 font-medium border-l-2 border-blue-400"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
            )}
            onClick={handleNavigation}
            title={localChat.title}
        >
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="truncate">{localChat.title}</span>
                {localChat.tags && localChat.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                        {localChat.tags.map(tag => (
                            <span key={tag} className="text-[10px] bg-blue-500/20 text-blue-300 px-1 rounded-sm">#{tag}</span>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex items-center">
                {(!localChat.content || localChat.content.length === 0) && (
                    <span className="text-[10px] text-yellow-600 mr-2" title="Not Indexed">●</span>
                )}
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                    <button onClick={(e) => { e.stopPropagation(); handleTogglePin(); }} className={`p-0.5 hover:text-blue-400 ${localChat.pinned ? 'text-blue-400' : ''}`}><Pin size={10} /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleEditTags(); }} className="p-0.5 hover:text-blue-400"><Tag size={10} /></button>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm('Remove?')) onRemove(); }} className="p-0.5 hover:text-red-400"><Trash2 size={10} /></button>
                </div>
            </div>
        </div>
    );
}

function getGeminiTitle() {
    const selectors = ['h1.conversation-title', 'div[data-testid="conversation-title-region"] span', 'span[data-testid="chat-title"]', '.conversation-title'];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) return el.textContent.trim();
    }
    const docTitle = document.title.replace(/ - Google Gemini$/, '').trim();
    return (docTitle && docTitle !== 'Google Gemini') ? docTitle : 'Google Gemini';
}
