import React, { useState, useEffect } from 'react';
import { Pin, X, ExternalLink } from 'lucide-react';
import type { Chat } from '../types';
import { storage } from '../utils/storage';

interface ReferencePanelProps {
    allChats: Record<string, Chat>;
    onClose: () => void;
}

export const ReferencePanel: React.FC<ReferencePanelProps> = ({ allChats, onClose }) => {
    // 1. Filter Pinned Chats
    const pinnedChats = Object.values(allChats).filter(c => c.pinned);

    // 2. Select the first pinned chat by default if none selected
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedChatId && pinnedChats.length > 0) {
            setSelectedChatId(pinnedChats[0].id);
        }
    }, [pinnedChats.length]);

    const selectedChat = selectedChatId ? allChats[selectedChatId] : null;

    const handleUnpin = async (e: React.MouseEvent, chatId: string) => {
        e.stopPropagation();
        await storage.toggleChatPin(chatId);
        if (selectedChatId === chatId) {
            setSelectedChatId(null);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-900 border-l border-gray-700 w-80 lg:w-96 shadow-xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-800">
                <h2 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                    <Pin size={14} className="text-blue-400" />
                    Reference Panel
                </h2>
                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                    <X size={16} />
                </button>
            </div>

            {/* Pinned Tabs (Horizontal Scroll) */}
            <div className="flex overflow-x-auto p-2 gap-2 border-b border-gray-700 scrollbar-hide">
                {pinnedChats.length === 0 ? (
                    <div className="text-xs text-gray-500 italic p-1">No pinned chats</div>
                ) : (
                    pinnedChats.map(chat => (
                        <button
                            key={chat.id}
                            onClick={() => setSelectedChatId(chat.id)}
                            className={`
                                flex items-center gap-2 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors
                                ${selectedChatId === chat.id
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}
                            `}
                        >
                            <span className="max-w-[100px] truncate">{chat.title}</span>
                            <div
                                onClick={(e) => handleUnpin(e, chat.id)}
                                className={`ml-1 p-0.5 rounded-full hover:bg-black/20 ${selectedChatId === chat.id ? 'text-blue-200' : 'text-gray-500'}`}
                            >
                                <X size={10} />
                            </div>
                        </button>
                    ))
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#1e1f20]">
                {selectedChat ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                        <div className="flex justify-between items-start mb-4 pb-2 border-b border-gray-700">
                            <h3 className="text-lg font-medium text-white m-0">{selectedChat.title}</h3>
                            <a
                                href={selectedChat.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 hover:text-blue-300"
                                title="Open Original Chat"
                            >
                                <ExternalLink size={14} />
                            </a>
                        </div>

                        <div className="whitespace-pre-wrap font-sans text-gray-300 leading-relaxed text-sm">
                            {/* Simple rendering for now. Could use markdown-to-jsx later */}
                            {selectedChat.content || (
                                <span className="text-gray-500 italic">No content indexed for this chat. Open it to sync.</span>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center p-6">
                        <Pin size={32} className="mb-3 opacity-20" />
                        <p className="text-sm">Pin chats from your project list to view them here while working.</p>
                        <p className="text-xs mt-2 opacity-60">Hover over a chat and click the Pin icon in the sidebar.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
