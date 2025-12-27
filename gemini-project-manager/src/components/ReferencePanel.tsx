import React, { useState, useEffect } from 'react';
import { Pin, PinOff, X, ExternalLink } from 'lucide-react';
import type { Chat } from '../types';
import { storage } from '../utils/storage';

interface ReferencePanelProps {
    allChats: Record<string, Chat>;
    onClose: () => void;
    isFloating?: boolean;
}

export const ReferencePanel: React.FC<ReferencePanelProps> = ({ allChats, onClose, isFloating = false }) => {
    // 1. Filter Pinned Chats
    const pinnedChats = Object.values(allChats).filter(c => c.pinned);

    // 2. Select the first pinned chat by default if none selected
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

    // 3. Track scroll positions per chat
    const [scrollPositions, setScrollPositions] = useState<Record<string, number>>({});
    const contentRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectedChatId && pinnedChats.length > 0) {
            setSelectedChatId(pinnedChats[0].id);
        }
    }, [pinnedChats.length]);

    const selectedChat = selectedChatId ? allChats[selectedChatId] : null;

    // Save current scroll position and switch to new chat
    const handleTabSwitch = (chatId: string) => {
        // Save current scroll position before switching
        if (selectedChatId && contentRef.current) {
            setScrollPositions(prev => ({
                ...prev,
                [selectedChatId]: contentRef.current!.scrollTop
            }));
        }
        setSelectedChatId(chatId);
    };

    // Restore scroll position when chat changes
    useEffect(() => {
        if (selectedChatId && contentRef.current) {
            const savedPosition = scrollPositions[selectedChatId] || 0;
            contentRef.current.scrollTop = savedPosition;
        }
    }, [selectedChatId]);

    const handleUnpin = async (e: React.MouseEvent, chatId: string) => {
        e.stopPropagation();
        await storage.toggleChatPin(chatId);
        if (selectedChatId === chatId) {
            setSelectedChatId(null);
        }
    };

    // Inline styles for floating mode (Tailwind not available in content script)
    const floatingStyles = {
        container: {
            display: 'flex',
            flexDirection: 'column' as const,
            height: '100%',
            minHeight: 0, // Required for flex scrolling
            backgroundColor: '#111827',
            width: '100%',
            color: 'white',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '14px'
            // No border-radius here - parent FloatingReferencePanel handles it
        },
        header: {
            padding: '12px 16px',
            borderBottom: '1px solid #374151',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#1f2937',
            flexShrink: 0
        },
        headerTitle: {
            fontSize: '14px',
            fontWeight: 600,
            color: '#f3f4f6',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            margin: 0
        },
        closeButton: {
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        },
        tabsContainer: {
            display: 'flex',
            overflowX: 'auto' as const,
            padding: '10px 12px',
            gap: '8px',
            borderBottom: '1px solid #374151',
            backgroundColor: '#111827',
            flexShrink: 0
        },
        tab: (isSelected: boolean) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 500,
            whiteSpace: 'nowrap' as const,
            cursor: 'pointer',
            border: 'none',
            backgroundColor: isSelected ? '#3b82f6' : '#374151',
            color: isSelected ? 'white' : '#d1d5db',
            transition: 'all 0.15s ease'
        }),
        tabClose: {
            marginLeft: '2px',
            padding: '2px',
            borderRadius: '50%',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center'
        },
        contentArea: {
            flex: 1,
            minHeight: 0, // Critical for scrolling
            overflowY: 'auto' as const,
            padding: '16px',
            backgroundColor: '#0d1117'
        },
        chatHeader: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid #374151'
        },
        chatTitle: {
            fontSize: '16px',
            fontWeight: 600,
            color: 'white',
            margin: 0
        },
        externalLink: {
            color: '#60a5fa',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center'
        },
        // Conversation bubble styles
        userBubble: {
            backgroundColor: '#1e40af',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '12px',
            marginBottom: '8px',
            fontSize: '13px',
            lineHeight: 1.5
        },
        modelBubble: {
            backgroundColor: '#1f2937',
            color: '#e5e7eb',
            padding: '12px 16px',
            borderRadius: '12px',
            marginBottom: '16px',
            fontSize: '13px',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap' as const
        },
        turnLabel: {
            fontSize: '10px',
            color: '#6b7280',
            marginBottom: '4px',
            fontWeight: 500
        },
        emptyState: {
            height: '100%',
            display: 'flex',
            flexDirection: 'column' as const,
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
            textAlign: 'center' as const,
            padding: '24px'
        },
        emptyText: {
            fontSize: '14px',
            margin: '12px 0 0 0'
        },
        emptySubtext: {
            fontSize: '12px',
            marginTop: '8px',
            opacity: 0.6
        }
    };

    // Helper to parse content into conversation bubbles
    const renderConversation = (content: string) => {
        if (!content) return null;

        // Try to parse turns from the formatted text
        const segments = content.split(/---\n*/);
        const elements: React.ReactNode[] = [];

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i].trim();
            if (!segment) continue;

            const isUser = segment.startsWith('👤') || segment.toLowerCase().includes('you:');

            // Clean the text
            let text = segment
                .replace(/^👤\s*You:\s*/i, '')
                .replace(/^🤖\s*Gemini:\s*/i, '')
                .trim();

            if (!text) continue;

            if (isUser) {
                elements.push(
                    <div key={i}>
                        <div style={floatingStyles.turnLabel}>You</div>
                        <div style={floatingStyles.userBubble}>{text}</div>
                    </div>
                );
            } else {
                elements.push(
                    <div key={i}>
                        <div style={floatingStyles.turnLabel}>Gemini</div>
                        <div style={floatingStyles.modelBubble}>{text}</div>
                    </div>
                );
            }
        }

        if (elements.length === 0) {
            // Fallback: just show the raw content in a model bubble
            return <div style={floatingStyles.modelBubble}>{content}</div>;
        }

        return <>{elements}</>;
    };

    if (isFloating) {
        return (
            <div style={floatingStyles.container}>
                {/* Header */}
                <div style={floatingStyles.header}>
                    <h2 style={floatingStyles.headerTitle}>
                        <Pin size={14} style={{ color: '#60a5fa' }} />
                        Reference Panel
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {pinnedChats.length > 0 && (
                            <button
                                onClick={async () => {
                                    if (confirm('Clear all pinned chats?')) {
                                        await storage.clearAllPins();
                                        setSelectedChatId(null);
                                    }
                                }}
                                style={{
                                    ...floatingStyles.closeButton,
                                    color: '#ef4444'
                                }}
                                title="Clear all pins"
                            >
                                <PinOff size={16} />
                            </button>
                        )}
                        <button onClick={onClose} style={floatingStyles.closeButton}>
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Pinned Tabs */}
                <div style={floatingStyles.tabsContainer}>
                    {pinnedChats.length === 0 ? (
                        <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic', padding: '4px' }}>No pinned chats</div>
                    ) : (
                        pinnedChats.map(chat => (
                            <button
                                key={chat.id}
                                onClick={() => handleTabSwitch(chat.id)}
                                style={floatingStyles.tab(selectedChatId === chat.id)}
                            >
                                <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chat.title}</span>
                                <span
                                    onClick={(e) => handleUnpin(e, chat.id)}
                                    style={floatingStyles.tabClose}
                                >
                                    <X size={10} />
                                </span>
                            </button>
                        ))
                    )}
                </div>

                {/* Content Area */}
                <div ref={contentRef} style={floatingStyles.contentArea}>
                    {selectedChat ? (
                        <div>
                            <div style={floatingStyles.chatHeader}>
                                <h3 style={floatingStyles.chatTitle}>{selectedChat.title}</h3>
                                <a
                                    href={selectedChat.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={floatingStyles.externalLink}
                                    title="Open Original Chat"
                                >
                                    <ExternalLink size={14} />
                                </a>
                            </div>

                            {selectedChat.content ? (
                                renderConversation(selectedChat.content)
                            ) : (
                                <div style={floatingStyles.emptyState}>
                                    <span style={{ color: '#6b7280', fontStyle: 'italic' }}>No content indexed for this chat. Open it to sync.</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={floatingStyles.emptyState}>
                            <Pin size={32} style={{ opacity: 0.2 }} />
                            <p style={floatingStyles.emptyText}>Pin chats from your project list to view them here while working.</p>
                            <p style={floatingStyles.emptySubtext}>Hover over a chat and click the Pin icon in the sidebar.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Original Tailwind-based rendering for sidebar context
    return (
        <div className={`flex flex-col h-full bg-gray-900 border-l border-gray-700 w-80 lg:w-96 shadow-xl animate-in slide-in-from-right duration-300`}>
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
