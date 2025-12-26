import { useState, useEffect, useRef } from 'react';
import { Trash2, MessageSquare, Plus, Folder as FolderIcon, ChevronRight, ChevronDown, Pencil, Search, FileDown, Tag, Pin } from 'lucide-react';
import FolderChat from './FolderChat';
import { useProjects } from '../hooks/useProjects';
import { useActiveChat } from '../hooks/useActiveChat';
import type { Folder, Chat, StorageData } from '../types';
import { storage } from '../utils/storage';
import { findChatElement } from '../utils/dom';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface ProjectListProps {
    isSidePanel?: boolean;
    currentUrl?: string;
}

export default function ProjectList({ isSidePanel = false, currentUrl }: ProjectListProps) {
    const { folders, chats, activeWorkspaceId, loading, addFolder, deleteFolder, addChatToFolder, refresh } = useProjects();
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // --- Active Chat Detection (Title-Based) ---
    const { activeTitle } = useActiveChat(isSidePanel);

    // Helper to normalize titles for comparison
    const normalize = (s: string) => s.toLowerCase().trim().replace(/[^\w\s]/g, '');

    // Find the chat ID that matches the active title
    const activeChatId = activeTitle
        ? Object.keys(chats).find(key => {
            const chat = chats[key];
            if (!chat.title) return false;

            const storedNorm = normalize(chat.title);
            const activeNorm = normalize(activeTitle);

            if (storedNorm === activeNorm) return true;
            if (storedNorm.includes(activeNorm) || activeNorm.includes(storedNorm)) return true;

            const minLen = Math.min(storedNorm.length, activeNorm.length, 20);
            if (minLen >= 5 && storedNorm.substring(0, minLen) === activeNorm.substring(0, minLen)) return true;

            return false;
        }) || null
        : null;

    const handleCreate = async () => {
        if (!newFolderName.trim()) return;
        await addFolder(newFolderName);
        setNewFolderName('');
        setIsCreating(false);
    };

    // --- Search & Filtering Logic ---
    const workspaceFolders = folders.filter(f => f.workspaceId === activeWorkspaceId);
    let filteredFolders: (Folder & { _forceExpand?: boolean })[] = workspaceFolders;

    if (searchQuery.trim()) {
        const isTagSearch = searchQuery.startsWith('#');
        const query = isTagSearch ? searchQuery.slice(1).toLowerCase() : searchQuery.toLowerCase();

        filteredFolders = workspaceFolders.map(folder => {
            // 1. If folder name matches search (only if NOT tag search), keep it and show all its chats
            if (!isTagSearch && folder.name.toLowerCase().includes(query)) {
                return { ...folder, _forceExpand: true };
            }

            // 2. Filter chats
            const matchingChatIds = folder.chatIds.filter(chatId => {
                const chat = chats[chatId];
                if (!chat) return false;

                if (isTagSearch) {
                    return chat.tags?.some(t => t.toLowerCase().includes(query));
                } else {
                    return chat.title.toLowerCase().includes(query);
                }
            });

            if (matchingChatIds.length > 0) {
                return {
                    ...folder,
                    chatIds: matchingChatIds,
                    _forceExpand: true
                };
            }

            return null;
        }).filter(Boolean) as (Folder & { _forceExpand?: boolean })[];
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
                {filteredFolders.map(folder => (
                    <FolderItem
                        key={folder.id}
                        folder={folder}
                        allChats={chats} // Pass full chat map
                        activeChatId={activeChatId} // Pass active ID
                        forceExpand={folder._forceExpand}
                        onDelete={() => deleteFolder(folder.id)}
                        onAddChat={addChatToFolder}
                        onRefresh={refresh}
                        onRemoveChat={async (chatId) => {
                            await storage.removeChatFromFolder(chatId, folder.id);
                            refresh();
                        }}
                        isSidePanel={isSidePanel}
                        currentUrl={currentUrl}
                    />
                ))}

                {filteredFolders.length === 0 && (
                    <div className="text-xs text-gray-500 text-center py-4">
                        {searchQuery ? 'No results found.' : 'No projects yet.'}
                    </div>
                )}
            </div>
        </div>
    );
}

function FolderItem({ folder, allChats, activeChatId, forceExpand, onDelete, onAddChat, onRefresh, onRemoveChat, isSidePanel, currentUrl }: {
    folder: Folder;
    allChats: Record<string, Chat>;
    activeChatId: string | null;
    forceExpand?: boolean;
    onDelete: () => void;
    onAddChat: (folderId: string, chat: any) => void;
    onRefresh: () => void;
    onRemoveChat: (chatId: string) => void;
    isSidePanel?: boolean;
    currentUrl?: string; // Add this
}) {
    // Auto-expand if search forces it, OR if the active chat is inside this folder
    const hasActiveChat = activeChatId ? folder.chatIds.includes(activeChatId) : false;

    // Use an effect to sync expansion state when forceExpand or hasActiveChat changes
    const [isExpanded, setIsExpanded] = useState(folder.collapsed ? false : true);

    // Filter chats in this folder to get their data
    const folderChats = folder.chatIds.map(id => allChats[id]).filter(Boolean);

    // Calculate stats
    const totalChats = folderChats.length;
    const syncedChats = folderChats.filter(c => c.content && c.content.length > 0).length;
    const isFullySynced = totalChats > 0 && totalChats === syncedChats;

    useEffect(() => {
        if (forceExpand || hasActiveChat) setIsExpanded(true);
    }, [forceExpand, hasActiveChat, folder.id]);

    // Folder Chat State
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
            let context = "";
            if (chatMessages.length === 0) {
                context = `CONTEXT FROM FOLDER: "${folder.name}"\n\n`;
                folderChats.forEach((chat: Chat) => {
                    if (chat.content) {
                        context += `--- START CHAT: ${chat.title} ---\n${chat.content}\n--- END CHAT ---\n\n`;
                    }
                });
            }

            const response = await chrome.runtime.sendMessage({
                type: 'CMD_FOLDER_CHAT_SEND',
                folderId: folder.id,
                text,
                context: context ? context : undefined
            });

            if (response && response.success) {
                const aiMsg = { id: (Date.now() + 1).toString(), role: 'assistant' as const, text: response.text, timestamp: Date.now() };
                setChatMessages(prev => [...prev, aiMsg]);
            } else {
                const errorMsg = { id: (Date.now() + 1).toString(), role: 'assistant' as const, text: "Error: " + (response?.error || "Failed to talk to Gemini"), timestamp: Date.now() };
                setChatMessages(prev => [...prev, errorMsg]);
            }

        } catch (err) {
            console.error(err);
            const errorMsg = { id: (Date.now() + 1).toString(), role: 'assistant' as const, text: "Error: Extension communication failed.", timestamp: Date.now() };
            setChatMessages(prev => [...prev, errorMsg]);
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
        if (confirm(`Are you sure you want to delete folder "${folder.name}" ? `)) {
            onDelete();
        }
    };

    const handleExport = () => {
        let md = `# Folder: ${folder.name}\n\n`;
        folderChats.forEach(chat => {
            md += `## ${chat.title}\n\n${chat.content || '(No content synced)'}\n\n---\n\n`;
        });
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${folder.name.replace(/\s+/g, '_')}-report.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // --- Drag and Drop Handlers ---
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isDragOver) {
            setIsDragOver(true);
        }

        if (!isExpanded && !expandTimerRef.current) {
            expandTimerRef.current = setTimeout(() => {
                setIsExpanded(true);
            }, 600);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.currentTarget.contains(e.relatedTarget as Node)) {
            return;
        }

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

        try {
            const json = e.dataTransfer.getData('application/json');

            if (json) {
                const data = JSON.parse(json);
                if (data.id && data.title) {
                    onAddChat(folder.id, data);

                    const existingChat = allChats[data.id];
                    const needsIndexing = !existingChat || !existingChat.content;
                    if (needsIndexing) {
                        console.log("Gemini Project Manager: Chat dropped is unindexed. Queueing:", data.id);
                        chrome.runtime.sendMessage({
                            type: 'CMD_INDEX_CHAT',
                            chatId: data.id,
                            title: data.title
                        });
                    }
                }
            } else {
                const url = e.dataTransfer.getData('text/plain');
                if (url && url.includes('/app/')) {
                    const idMatch = url.match(/\/app\/([a-zA-Z0-9_-]+)/);
                    if (idMatch) {
                        onAddChat(folder.id, {
                            id: idMatch[1],
                            title: "Dropped Chat",
                            url: url,
                            timestamp: Date.now()
                        });
                    }
                }
            }
        } catch (err) {
            console.error("Gemini Project Manager: Failed to handle drop:", err);
        }
    };

    return (
        <div
            className={`group ${isDragOver ? 'bg-gray-800 ring-1 ring-blue-500 rounded' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800 text-gray-300 hover:text-white group-hover:bg-opacity-80 transition-colors ${isDragOver ? 'bg-gray-800' : ''}`}>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-0.5 hover:bg-gray-700 rounded text-gray-500"
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
                            {/* Sync Status Indicator */}
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
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsEditing(true);
                            }}
                            className="p-1 hover:text-blue-400 rounded transition-all"
                            title="Rename Folder"
                        >
                            <Pencil size={12} />
                        </button>

                        <button
                            onClick={handleChatWithFolder}
                            className={`p-1 rounded transition-all ${isChatOpen ? 'text-blue-400' : 'hover:text-blue-400 hover:bg-gray-700'}`}
                            title="Chat with Folder Context"
                        >
                            <MessageSquare size={12} />
                        </button>

                        <button
                            onClick={handleExport}
                            className="p-1 hover:text-green-400 hover:bg-gray-700 rounded transition-all"
                            title="Export to Markdown"
                        >
                            <FileDown size={12} />
                        </button>

                        <button
                            onClick={async (e) => {
                                e.stopPropagation();

                                let url = isSidePanel && currentUrl ? currentUrl : window.location.href;
                                let title = 'Untitled Chat';
                                let chatIdFromUrl = null;

                                if (isSidePanel) {
                                    // Get info from content script
                                    try {
                                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                                        if (tab?.id) {

                                            // Ask content script for "real" title just in case (e.g. if tab title is generic)
                                            // But tab.title is usually usually correct per useActiveChat logic
                                            const response = await chrome.tabs.sendMessage(tab.id, { type: 'CMD_GET_CURRENT_CHAT_INFO' });
                                            if (response) {
                                                if (response.title) title = response.title;
                                                if (response.url) url = response.url;
                                            } else {
                                                // Fallback to tab info
                                                if (tab.title) title = tab.title.replace(/ - Google Gemini$/, '');
                                                if (tab.url) url = tab.url;
                                            }
                                        }
                                    } catch (err) {
                                        console.warn("Could not query content script, using tab info fallback");
                                        // Fallback is already defaults
                                    }
                                } else {
                                    // Overlay mode: Direct access
                                    url = window.location.href;
                                    title = getGeminiTitle();
                                }

                                const match = url.match(/\/app\/([a-zA-Z0-9]+)/);
                                if (match) chatIdFromUrl = match[1];

                                if (title === 'Google Gemini' || title === 'Untitled Chat') {
                                    const manualTitle = prompt("Enter chat name:", "My Chat");
                                    if (manualTitle) title = manualTitle;
                                }

                                if (chatIdFromUrl) {
                                    onAddChat(folder.id, { id: chatIdFromUrl, title, url, timestamp: Date.now() });
                                } else {
                                    alert("No active chat found (URL must contain /app/ID).");
                                }
                            }}
                            className="p-1 hover:bg-gray-700 hover:text-green-400 rounded transition-all"
                            title="Add Current Chat"
                        >
                            <Plus size={12} />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                            className="p-1 hover:bg-red-900/50 hover:text-red-400 rounded transition-all"
                            title="Delete Folder"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                )}
            </div >

            {/* Folder Chat Interface */}
            {isChatOpen && (
                <FolderChat
                    folderName={folder.name}
                    folderId={folder.id}
                    onClose={() => {
                        setIsChatOpen(false);
                        chrome.runtime.sendMessage({
                            type: 'CMD_CLOSE_FOLDER_CHAT',
                            folderId: folder.id
                        }).catch(() => { });
                    }}
                    messages={chatMessages}
                    onSendMessage={handleSendMessage}
                    isLoading={isChatLoading}
                />
            )}

            {
                isExpanded && (
                    <div className={`ml-7 border-l border-gray-700 pl-2 py-1 space-y-1 ${isDragOver ? 'pointer-events-none' : ''}`}>
                        {folder.chatIds.length === 0 ? (
                            <div className="text-[10px] text-gray-600 italic">Empty</div>
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
        </div >
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

        if (!localChat || !localChat.url) return;

        if (isSidePanel) {
            // Side Panel: Navigate the main window
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
                // Check if we are already on this URL (to avoid reload)
                if (tab.url === localChat.url) return;

                // First try to tell content script to click the link internally (SPA nav)
                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        type: 'CMD_OPEN_CHAT',
                        chatId,
                        url: localChat.url
                    });
                } catch (err) {
                    // If content script fails (e.g. not loaded), hard navigate
                    chrome.tabs.update(tab.id, { url: localChat.url });
                }
            }
        } else {
            // Overlay Mode: Direct interaction
            const sidebarEl = findChatElement(chatId, localChat.title);
            if (sidebarEl) {
                sidebarEl.click();
            } else {
                window.location.href = localChat.url;
            }
        }
    };

    const handleEditTags = async () => {
        const currentTags = localChat?.tags?.join(', ') || '';
        const newTagsStr = prompt("Edit Tags (comma separated, e.g. finance, urgent):", currentTags);
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
                    <span className="text-[10px] text-yellow-600 mr-2" title="Not Indexed (Open chat to sync)">
                        ●
                    </span>
                )}

                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePin();
                        }}
                        className={`p-0.5 hover:text-blue-400 ${localChat.pinned ? 'text-blue-400' : ''}`}
                        title={localChat.pinned ? "Unpin Chat" : "Pin to Reference Panel"}
                    >
                        <Pin size={10} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleEditTags();
                        }}
                        className="p-0.5 hover:text-blue-400"
                        title="Edit Tags"
                    >
                        <Tag size={10} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Remove chat from project?')) onRemove();
                        }}
                        className="p-0.5 hover:text-red-400"
                    >
                        <Trash2 size={10} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function getGeminiTitle() {
    const selectors = [
        'h1.conversation-title',
        'div[data-testid="conversation-title-region"] span',
        'span[data-testid="chat-title"]',
        '.conversation-title'
    ];

    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) return el.textContent.trim();
    }

    const docTitle = document.title.replace(/ - Google Gemini$/, '').trim();
    if (docTitle && docTitle !== 'Google Gemini') return docTitle;

    return 'Google Gemini';
}
