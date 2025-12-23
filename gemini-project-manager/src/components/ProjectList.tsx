import { useState, useEffect, useRef } from 'react';
import { Folder as FolderIcon, Trash2, ChevronRight, ChevronDown, Plus, Pencil } from 'lucide-react';
import { useProjects } from '../hooks/useProjects';
import type { Folder, StorageData } from '../types';
import { storage } from '../utils/storage';
import { findChatElement } from '../utils/dom';

export default function ProjectList() {
    const { folders, loading, addFolder, deleteFolder, addChatToFolder, refresh } = useProjects();
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const handleCreate = async () => {
        if (!newFolderName.trim()) return;
        await addFolder(newFolderName);
        setNewFolderName('');
        setIsCreating(false);
    };

    if (loading) return <div className="p-4 text-gray-400 text-sm">Loading projects...</div>;

    return (
        <div className="flex-1 overflow-y-auto">
            {/* Create Input */}
            {isCreating ? (
                <div className="p-2 mx-2 mb-2 bg-gray-800 rounded border border-gray-600">
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
                <div className="px-4 pb-2">
                    <button
                        onClick={() => setIsCreating(true)}
                        className="w-full flex items-center gap-2 text-gray-400 hover:text-white text-sm py-1.5 px-2 rounded hover:bg-gray-800 transition-colors"
                    >
                        <Plus size={14} />
                        <span>New Project</span>
                    </button>
                </div>
            )}

            {/* Folder List */}
            <div className="space-y-0.5 px-2">
                {folders.map(folder => (
                    <FolderItem
                        key={folder.id}
                        folder={folder}
                        onDelete={() => deleteFolder(folder.id)}
                        onAddChat={addChatToFolder}
                        onRefresh={refresh}
                        onRemoveChat={async (chatId) => {
                            await storage.removeChatFromFolder(chatId, folder.id);
                            refresh();
                        }}
                    />
                ))}

                {folders.length === 0 && !isCreating && (
                    <div className="text-xs text-gray-500 text-center py-4">
                        No projects yet.
                    </div>
                )}
            </div>
        </div>
    );
}

function FolderItem({ folder, onDelete, onAddChat, onRefresh, onRemoveChat }: {
    folder: Folder;
    onDelete: () => void;
    onAddChat: (folderId: string, chat: any) => void;
    onRefresh: () => void;
    onRemoveChat: (chatId: string) => void;
}) {
    const [isExpanded, setIsExpanded] = useState(!folder.collapsed);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(folder.name);
    const [isDragOver, setIsDragOver] = useState(false);
    const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSaveResize = async () => {
        if (!editName.trim()) return;
        // Ideally we have a 'renameFolder' in storage/hook, but for now we manually update
        const data = await storage.get();
        const updatedFolders = data.folders.map(f => f.id === folder.id ? { ...f, name: editName } : f);
        await storage.save({ folders: updatedFolders });
        setIsEditing(false);
        onRefresh();
    };

    const handleDelete = () => {
        if (confirm(`Are you sure you want to delete folder "${folder.name}"?`)) {
            onDelete();
        }
    };

    // --- Drag and Drop Handlers ---

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Client must allow drop
        e.stopPropagation();

        if (!isDragOver) {
            console.log("Gemini Project Manager: Drag Enter/Over detected on folder", folder.name);
            setIsDragOver(true);
        }

        // Auto-expand logic
        if (!isExpanded && !expandTimerRef.current) {
            expandTimerRef.current = setTimeout(() => {
                console.log("Gemini Project Manager: Auto-expanding folder", folder.name);
                setIsExpanded(true);
            }, 600);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Fix: Only set isDragOver false if we are actually leaving the container,
        // not just entering a child element.
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
        console.log("Gemini Project Manager: Drop detected on folder", folder.name);

        setIsDragOver(false);

        if (expandTimerRef.current) {
            clearTimeout(expandTimerRef.current);
            expandTimerRef.current = null;
        }

        try {
            const json = e.dataTransfer.getData('application/json');
            console.log("Gemini Project Manager: Drop data (JSON) length:", json?.length);

            if (json) {
                const data = JSON.parse(json);
                console.log(`Gemini Project Manager: Parsed drop data: ID="${data.id}", Title="${data.title}"`);

                if (data.id && data.title) {
                    onAddChat(folder.id, data);
                } else {
                    console.error("Gemini Project Manager: Missing ID or Title in drop data", data);
                }
            } else {
                // Fallback for simple link drags if someone drags a link NOT via our script
                const url = e.dataTransfer.getData('text/plain');
                console.log("Gemini Project Manager: Drop fallback URL:", url);

                if (url && url.includes('/app/')) {
                    const idMatch = url.match(/\/app\/([a-zA-Z0-9_-]+)/);
                    if (idMatch) {
                        const extractedId = idMatch[1];
                        console.log(`Gemini Project Manager: Extracted fallback ID: ${extractedId}`);
                        onAddChat(folder.id, {
                            id: extractedId,
                            title: "Dropped Chat",
                            url: url,
                            timestamp: Date.now()
                        });
                    } else {
                        console.warn("Gemini Project Manager: Could not extract ID from URL:", url);
                    }
                } else {
                    console.warn("Gemini Project Manager: Drop ignored - no JSON and no valid Gemini URL");
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
                        <span className="text-sm truncate select-none cursor-pointer">{folder.name}</span>
                    )}
                </div>

                {!isEditing && (
                    <>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsEditing(true);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-blue-400 rounded transition-all"
                            title="Rename Folder"
                        >
                            <Pencil size={12} />
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const url = window.location.href;
                                const match = url.match(/\/app\/([a-zA-Z0-9]+)/);

                                let title = getGeminiTitle();
                                if (title === 'Google Gemini' || title === 'Untitled Chat') {
                                    const manualTitle = prompt("Enter chat name:", "My Chat");
                                    if (manualTitle) title = manualTitle;
                                }

                                if (match) {
                                    const chatId = match[1];
                                    onAddChat(folder.id, { id: chatId, title, url, timestamp: Date.now() });
                                } else {
                                    alert("No active chat found.");
                                }
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 hover:text-green-400 rounded transition-all"
                            title="Add Current Chat"
                        >
                            <Plus size={12} />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/50 hover:text-red-400 rounded transition-all"
                            title="Delete Folder"
                        >
                            <Trash2 size={12} />
                        </button>
                    </>
                )}
            </div>

            {isExpanded && (
                <div className={`ml-7 border-l border-gray-700 pl-2 py-1 space-y-1 ${isDragOver ? 'pointer-events-none' : ''}`}>
                    {folder.chatIds.length === 0 ? (
                        <div className="text-[10px] text-gray-600 italic">Empty</div>
                    ) : (
                        folder.chatIds.map(chatId => (
                            <ChatItem key={chatId} chatId={chatId} onRemove={() => onRemoveChat(chatId)} />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function ChatItem({ chatId, onRemove }: { chatId: string; onRemove: () => void }) {
    const [chat, setChat] = useState<any>(null);

    useEffect(() => {
        chrome.storage.local.get(['chats']).then((res) => {
            const result = res as unknown as StorageData;
            if (result.chats && result.chats[chatId]) {
                const c = result.chats[chatId];
                setChat(c);
            }
        });
    }, [chatId]);

    const handleNavigation = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!chat || !chat.url) return;

        // Strategy 1: "Direct Click" - Try to find the actual sidebar element and click it
        // This is the most robust way to trigger SPA navigation without reloading
        const sidebarEl = findChatElement(chatId, chat.title);
        if (sidebarEl) {
            console.log("Gemini Project Manager: Clicking sidebar element for chat", chatId);
            sidebarEl.click();
            return;
        }

        console.warn("Gemini Project Manager: Sidebar element not found, using Proxy Click fallback");

        // Strategy 2: "Proxy Click"
        // Events inside Shadow DOM might not bubble correctly to the app's router listener.
        // We create a temporary link in the MAIN document and click it.
        const link = document.createElement('a');
        link.href = chat.url;
        link.style.display = 'none';
        document.body.appendChild(link);

        // Dispatch a native click event
        link.click();

        // Cleanup
        setTimeout(() => {
            link.remove();
        }, 100);
    };

    if (!chat) return <div className="text-xs text-gray-500 py-0.5 px-2">Loading...</div>;

    return (
        <div
            className="group flex items-center justify-between text-xs text-gray-400 hover:text-white py-1 px-2 hover:bg-gray-800 rounded transition-colors cursor-pointer"
            onClick={handleNavigation}
            title={chat.title}
        >
            <span className="truncate flex-1">{chat.title}</span>
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Remove chat from project?')) onRemove();
                    }}
                    className="p-0.5 hover:text-red-400"
                    title="Remove Chat"
                >
                    <Trash2 size={10} />
                </button>
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

    // Fallback
    const docTitle = document.title.replace(/ - Google Gemini$/, '').trim();
    if (docTitle && docTitle !== 'Google Gemini') return docTitle;

    return 'Google Gemini';
}
