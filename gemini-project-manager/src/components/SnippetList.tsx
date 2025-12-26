import React, { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { injectPrompt } from '../utils/dom';
import type { Snippet } from '../types';
import { Trash2, Plus, Quote } from 'lucide-react';

export const SnippetList: React.FC = () => {
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');

    useEffect(() => {
        loadSnippets();
    }, []);

    const loadSnippets = async () => {
        const data = await storage.get();
        setSnippets(data.snippets || []);
    };

    const handleAdd = async () => {
        if (!newTitle.trim() || !newContent.trim()) return;

        await storage.addSnippet(newTitle, newContent);
        setNewTitle('');
        setNewContent('');
        setIsCreating(false);
        loadSnippets();
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Delete this snippet?')) {
            await storage.deleteSnippet(id);
            loadSnippets();
        }
    };

    const handleInject = (content: string) => {
        injectPrompt(content);
    };

    return (
        <div className="flex flex-col h-full bg-gray-900/50">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/80 backdrop-blur-md sticky top-0 z-10">
                <h2 className="text-gray-300 font-medium flex items-center gap-2">
                    <Quote size={16} />
                    Snippets
                </h2>
                <button
                    onClick={() => setIsCreating(!isCreating)}
                    className="p-1.5 hover:bg-gray-800 rounded-md text-gray-400 hover:text-white transition-colors"
                >
                    <Plus size={18} />
                </button>
            </div>

            {isCreating && (
                <div className="p-4 border-b border-gray-800 bg-gray-800/50 animate-in slide-in-from-top-2">
                    <input
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white mb-2 focus:ring-1 focus:ring-blue-500 outline-none"
                        placeholder="Snippet Title"
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        autoFocus
                    />
                    <textarea
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white mb-2 h-24 resize-none focus:ring-1 focus:ring-blue-500 outline-none"
                        placeholder="Prompt content..."
                        value={newContent}
                        onChange={e => setNewContent(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setIsCreating(false)}
                            className="px-3 py-1 text-xs text-gray-400 hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={!newTitle.trim() || !newContent.trim()}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors disabled:opacity-50"
                        >
                            Save Snippet
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {snippets.length === 0 && !isCreating ? (
                    <div className="text-center text-gray-500 py-10 text-sm">
                        <p>No snippets saved.</p>
                        <p className="mt-1">Click + to add frequent prompts.</p>
                    </div>
                ) : (
                    snippets.map(snippet => (
                        <div
                            key={snippet.id}
                            onClick={() => handleInject(snippet.content)}
                            className="group p-3 rounded-lg border border-gray-800 bg-gray-900 hover:bg-gray-800 hover:border-gray-700 transition-all cursor-pointer relative"
                        >
                            <div className="flex justify-between items-start mb-1">
                                <h3 className="text-sm font-medium text-gray-200 group-hover:text-blue-400 transition-colors">
                                    {snippet.title}
                                </h3>
                                <button
                                    onClick={(e) => handleDelete(snippet.id, e)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-gray-500 transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                                {snippet.content}
                            </p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
