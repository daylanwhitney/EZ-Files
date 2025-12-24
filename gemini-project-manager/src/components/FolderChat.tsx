import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X } from 'lucide-react';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: number;
}

interface FolderChatProps {
    folderName: string;
    folderId: string;
    onClose: () => void;
    onSendMessage: (text: string) => Promise<void>;
    messages: Message[];
    isLoading: boolean;
}

export default function FolderChat({ folderName, onClose, onSendMessage, messages, isLoading }: FolderChatProps) {
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    // Auto-focus input on open
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        const text = input;
        setInput('');
        await onSendMessage(text);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col bg-[#1e1f20] border-t border-b border-[#444746] animate-in slide-in-from-top-2 duration-200">
            {/* Context Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#131314] text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                <div className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-400" />
                    <span>Chatting with {folderName}</span>
                </div>
                <button onClick={onClose} className="hover:text-white transition-colors">
                    <X className="w-3 h-3" />
                </button>
            </div>

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 max-h-[300px] min-h-[150px] overflow-y-auto p-3 space-y-3 custom-scrollbar"
                style={{ scrollBehavior: 'smooth' }}
            >
                {messages.length === 0 && (
                    <div className="text-center text-xs text-gray-500 mt-4 italic">
                        Ask questions about the chats in this folder.
                    </div>
                )}

                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`
                                max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed
                                ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-none'
                                    : 'bg-[#2d2e2f] text-gray-200 rounded-bl-none border border-[#444746]'
                                }
                            `}
                        >
                            {msg.text}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-[#2d2e2f] rounded-lg px-3 py-2 rounded-bl-none border border-[#444746] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-2 bg-[#131314] flex gap-2 border-t border-[#444746]">
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about this project..."
                    className="flex-1 bg-[#1e1f20] text-xs text-white px-3 py-2 rounded-full border border-[#444746] focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className={`
                        p-2 rounded-full transition-all
                        ${!input.trim() || isLoading
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-500 hover:scale-105'
                        }
                    `}
                >
                    <Send className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}
