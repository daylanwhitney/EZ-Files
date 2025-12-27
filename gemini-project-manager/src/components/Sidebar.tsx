import { useState, useEffect, useRef } from 'react';
import { Settings, X, Download, Upload, Trash, ChevronDown, Check, Plus, Layout, Pin, Wand2, Edit3, Save } from 'lucide-react';
import { PROMPT_ENGINEER_SYSTEM } from '../utils/prompts';
import { callGeminiAPI } from '../utils/gemini-api';
import type { Workspace } from '../types';
import ProjectList from './ProjectList';
import { SnippetList } from './SnippetList';

import { storage } from '../utils/storage';
import { useProjects } from '../hooks/useProjects';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface SidebarProps {
    isSidePanel?: boolean;
}

const Sidebar = ({ isSidePanel = true }: SidebarProps) => {
    console.log("Gemini Project Manager: Sidebar Rendered. isSidePanel =", isSidePanel);
    const [isOpen, setIsOpen] = useState(isSidePanel);
    const [showSettings, setShowSettings] = useState(false);
    const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
    const [newWorkspaceName, setNewWorkspaceName] = useState('');
    const [activeTab, setActiveTab] = useState<'projects' | 'snippets'>('projects');

    // NEW STATE for Workspace Settings Modal
    const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
    const [editName, setEditName] = useState('');
    const [editPrompt, setEditPrompt] = useState('');
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [enhancingError, setEnhancingError] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState('');


    // Side Panel Context
    const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Get all data from hook
    const {
        importData,
        refresh,
        workspaces,
        activeWorkspaceId,
        setActiveWorkspace,
        addWorkspace,
        deleteWorkspace
    } = useProjects();

    const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

    useEffect(() => {
        if (isSidePanel) {
            setIsOpen(true);
            // Poll for the active tab so the sidebar knows which "Chat ID" we are looking at
            const updateActiveTab = async () => {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                setCurrentTab(tab);
            };

            updateActiveTab();

            const handleTabActivated = () => updateActiveTab();
            const handleTabUpdated = (_tabId: number, changeInfo: any) => {
                if (changeInfo.url) updateActiveTab();
            };

            chrome.tabs.onActivated.addListener(handleTabActivated);
            chrome.tabs.onUpdated.addListener(handleTabUpdated);

            return () => {
                chrome.tabs.onActivated.removeListener(handleTabActivated);
                chrome.tabs.onUpdated.removeListener(handleTabUpdated);
            };
        } else {
            const handleToggle = () => setIsOpen(prev => !prev);
            window.addEventListener('ez-files-toggle', handleToggle);
            return () => window.removeEventListener('ez-files-toggle', handleToggle);
        }
    }, [isSidePanel]);

    // Close dropdown when clicking outside
    useEffect(() => {
        if (showWorkspaceMenu) {
            const onClick = () => setShowWorkspaceMenu(false);
            window.addEventListener('click', onClick);
            return () => window.removeEventListener('click', onClick);
        }
    }, [showWorkspaceMenu]);

    // Load API key on mount
    useEffect(() => {
        storage.getApiKey().then(key => {
            if (key) setApiKey(key);
        });
    }, []);

    const handleCreateWorkspace = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newWorkspaceName.trim()) {
            await addWorkspace(newWorkspaceName);
            setNewWorkspaceName('');
            setShowWorkspaceMenu(false);
        }
    }

    const handleImportClick = () => fileInputRef.current?.click();
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            await importData(ev.target?.result as string);
            setShowSettings(false);
        };
        reader.readAsText(file);
    };


    // ACTION: Open the modal
    const handleEditWorkspace = (ws: Workspace, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingWorkspace(ws);
        setEditName(ws.name);
        setEditPrompt(ws.defaultPrompt || '');
        setShowWorkspaceMenu(false); // Close the dropdown
    };

    // ACTION: Save changes
    const handleSaveWorkspace = async () => {
        if (!editingWorkspace) return;

        // Update storage
        const data = await storage.get();
        const updatedWorkspaces = data.workspaces.map(w =>
            w.id === editingWorkspace.id
                ? { ...w, name: editName, defaultPrompt: editPrompt }
                : w
        );
        await storage.save({ workspaces: updatedWorkspaces });

        refresh(); // Refresh UI
        setEditingWorkspace(null);
    };

    // ACTION: The "Magic" Button Logic (Modal)
    const handleEnhancePrompt = async () => {
        if (!editPrompt.trim()) return;
        if (!apiKey) {
            setEnhancingError('API key required. Add it in Settings.');
            return;
        }
        setIsEnhancing(true);
        setEnhancingError(null);

        try {
            const result = await callGeminiAPI(apiKey, editPrompt, PROMPT_ENGINEER_SYSTEM);
            setEditPrompt(result);
        } catch (error: any) {
            console.error("Enhancement failed", error);
            setEnhancingError(error.message || 'API call failed.');
        } finally {
            setIsEnhancing(false);
        }
    };

    // ACTION: Enhance Active Workspace (Global Settings)
    const handleEnhanceActiveWorkspace = async () => {
        if (!activeWorkspace?.defaultPrompt?.trim()) return;
        if (!apiKey) {
            setEnhancingError('API key required. Add it below.');
            return;
        }
        setIsEnhancing(true);
        setEnhancingError(null);

        try {
            const result = await callGeminiAPI(apiKey, activeWorkspace.defaultPrompt, PROMPT_ENGINEER_SYSTEM);
            await storage.updateWorkspaceDefaultPrompt(activeWorkspace.id, result);
            refresh();
        } catch (error: any) {
            console.error("Enhancement failed", error);
            setEnhancingError(error.message || 'API call failed.');
        } finally {
            setIsEnhancing(false);
        }
    };

    if (!isSidePanel && !isOpen) return null; // Keep logic simple for overlay mode

    return (
        <div className={cn(
            "bg-[#1e1f20] text-gray-200 font-sans flex flex-col pointer-events-auto",
            isSidePanel ? "w-full h-full" : "fixed top-0 right-0 h-screen transition-transform duration-300 z-[9999] border-l border-gray-700 shadow-xl",
            (!isSidePanel && isOpen) ? "translate-x-0" : (!isSidePanel ? "translate-x-full" : ""),
            isSidePanel ? "" : "w-80"
        )}>
            {/* Main Sidebar Column */}
            <div className={cn("flex flex-col h-full shrink-0", isSidePanel ? "w-full" : "w-80 border-r border-gray-700")}>
                {/* --- Header & Workspace Switcher --- */}
                <div className="flex items-center justify-between p-3 border-b border-gray-700 h-14 bg-[#1e1f20] relative shrink-0">

                    {/* Workspace Dropdown Trigger */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowWorkspaceMenu(!showWorkspaceMenu); }}
                        className="flex items-center gap-2 hover:bg-gray-800 px-2 py-1.5 rounded transition-colors max-w-[160px]"
                    >
                        <div className="bg-blue-600/20 p-1 rounded text-blue-400">
                            <Layout size={14} />
                        </div>
                        <span className="font-semibold text-sm truncate">{activeWorkspace?.name || 'Loading...'}</span>
                        <ChevronDown size={12} className="text-gray-500" />
                    </button>

                    {/* Dropdown Menu */}
                    {showWorkspaceMenu && (
                        <div
                            className="absolute top-12 left-2 w-64 bg-[#2b2d30] border border-gray-600 rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-2 border-b border-gray-700 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Switch Workspace
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                {workspaces.map(w => (
                                    <div
                                        key={w.id}
                                        className="group flex items-center justify-between px-3 py-2 hover:bg-gray-700 cursor-pointer transition-colors"
                                        onClick={() => { setActiveWorkspace(w.id); setShowWorkspaceMenu(false); }}
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            {activeWorkspaceId === w.id && <Check size={14} className="text-green-400 shrink-0" />}
                                            <span className={cn("text-sm truncate", activeWorkspaceId === w.id ? "text-white" : "text-gray-300")}>
                                                {w.name}
                                            </span>
                                        </div>
                                        {workspaces.length > 1 && (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => handleEditWorkspace(w, e)}
                                                    className="p-1 hover:text-blue-400"
                                                    title="Workspace Settings"
                                                >
                                                    <Edit3 size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm(`Delete workspace "${w.name}"?`)) deleteWorkspace(w.id);
                                                    }}
                                                    className="p-1 hover:text-red-400"
                                                >
                                                    <Trash size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <form onSubmit={handleCreateWorkspace} className="p-2 border-t border-gray-700 bg-[#232426]">
                                <div className="flex items-center gap-2 bg-gray-900 rounded border border-gray-700 px-2 py-1">
                                    <Plus size={14} className="text-gray-500" />
                                    <input
                                        type="text"
                                        placeholder="New Workspace..."
                                        className="bg-transparent text-sm w-full focus:outline-none py-1"
                                        value={newWorkspaceName}
                                        onChange={e => setNewWorkspaceName(e.target.value)}
                                    />
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="flex items-center gap-1">
                        <button
                            onClick={async () => {
                                // Open Reference Panel as popup window via service worker
                                chrome.runtime.sendMessage({ type: 'CMD_OPEN_REFERENCE_PANEL' });
                            }}
                            className="p-1.5 rounded-md transition-colors hover:bg-gray-700 text-gray-400"
                            title="Open Reference Panel"
                        >
                            <Pin size={16} />
                        </button>
                        {!isSidePanel && (
                            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-gray-700 rounded-md transition-colors text-gray-400">
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>

                {/* --- Tabs --- */}
                <div className="flex border-b border-gray-700 bg-[#1e1f20] shrink-0">
                    <button
                        onClick={() => setActiveTab('projects')}
                        className={cn(
                            "flex-1 py-2 text-xs font-medium text-center transition-colors border-b-2 hover:bg-gray-800",
                            activeTab === 'projects' ? "border-blue-500 text-blue-400" : "border-transparent text-gray-400 hover:text-gray-300"
                        )}
                    >
                        Projects
                    </button>
                    <button
                        onClick={() => setActiveTab('snippets')}
                        className={cn(
                            "flex-1 py-2 text-xs font-medium text-center transition-colors border-b-2 hover:bg-gray-800",
                            activeTab === 'snippets' ? "border-blue-500 text-blue-400" : "border-transparent text-gray-400 hover:text-gray-300"
                        )}
                    >
                        Snippets
                    </button>
                </div>

                {/* --- Main Content --- */}
                {!showSettings ? (
                    <>
                        <div className="flex-1 overflow-hidden flex flex-col">
                            {/* Only render ProjectList if we have an active workspace */}
                            {activeTab === 'projects' && activeWorkspaceId && (
                                <ProjectList
                                    isSidePanel={isSidePanel}
                                    currentUrl={currentTab?.url}
                                />
                            )}
                            {activeTab === 'snippets' && <SnippetList />}
                        </div>
                        <div className="p-3 border-t border-gray-700 shrink-0">
                            <button
                                onClick={() => setShowSettings(true)}
                                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
                            >
                                <Settings size={16} />
                                <span>Settings</span>
                            </button>
                        </div>
                    </>
                ) : (
                    // --- Settings View ---
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                        <button
                            onClick={() => setShowSettings(false)}
                            className="text-sm text-gray-400 hover:text-white flex items-center gap-1 mb-2"
                        >
                            ← Back
                        </button>
                        <h2 className="font-semibold text-white">Data Management</h2>
                        <button onClick={() => storage.exportData()} className="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded border border-gray-600 transition-colors text-left">
                            <Download size={20} className="text-blue-400" />
                            <div>
                                <div className="font-medium text-sm">Backup Data</div>
                                <div className="text-xs text-gray-400">Export workspaces to JSON</div>
                            </div>
                        </button>
                        <button onClick={handleImportClick} className="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded border border-gray-600 transition-colors text-left">
                            <Upload size={20} className="text-green-400" />
                            <div>
                                <div className="font-medium text-sm">Restore Data</div>
                                <div className="text-xs text-gray-400">Import from backup file</div>
                            </div>
                        </button>

                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />

                        <div className="h-px bg-gray-700 my-2"></div>

                        <h2 className="font-semibold text-white">Workspace Settings</h2>
                        <div className="bg-gray-800 p-3 rounded border border-gray-700 flex flex-col gap-3">
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Workspace Name</label>
                                <input
                                    type="text"
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-gray-400 cursor-not-allowed focus:outline-none"
                                    value={activeWorkspace.name}
                                    disabled
                                    title="Rename feature coming soon"
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs text-gray-400">Default Prompt</label>
                                    {enhancingError && !editingWorkspace && <span className="text-xs text-red-400">{enhancingError}</span>}
                                </div>
                                <p className="text-[10px] text-gray-500 mb-1">Auto-injected when starting a new chat in this workspace.</p>
                                <div className="relative">
                                    <textarea
                                        className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 min-h-[80px] pb-8 font-mono"
                                        placeholder="e.g. You are a senior React developer. Always prefer functional components..."
                                        value={activeWorkspace.defaultPrompt || ''}
                                        onChange={(e) => {
                                            storage.updateWorkspaceDefaultPrompt(activeWorkspace.id, e.target.value);
                                            refresh();
                                        }}
                                    />
                                    <div className="absolute bottom-2 right-2">
                                        <button
                                            onClick={handleEnhanceActiveWorkspace}
                                            disabled={isEnhancing || !activeWorkspace.defaultPrompt}
                                            className={`text-xs flex items-center gap-1 px-2 py-1 rounded-full shadow-lg backdrop-blur-sm transition-all border ${isEnhancing
                                                ? 'bg-blue-900/50 border-blue-500/50 text-blue-200 cursor-wait'
                                                : 'bg-indigo-600/90 hover:bg-indigo-500 hover:scale-105 border-indigo-400/30 text-white'
                                                }`}
                                            title="Auto-Enhance with AI"
                                        >
                                            <Wand2 size={12} className={isEnhancing ? "animate-spin" : ""} />
                                            {isEnhancing ? 'Magic...' : 'Auto-Enhance'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="h-px bg-gray-700 my-2"></div>

                        <h2 className="font-semibold text-white">Gemini API</h2>
                        <div className="bg-gray-800 p-3 rounded border border-gray-700 flex flex-col gap-2">
                            <label className="text-xs text-gray-400">API Key</label>
                            <p className="text-[10px] text-gray-500">Required for Auto-Enhance. Get yours at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-blue-400 underline">aistudio.google.com</a></p>
                            <input
                                type="password"
                                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                                placeholder="AIza..."
                                value={apiKey}
                                onChange={(e) => {
                                    setApiKey(e.target.value);
                                    storage.setApiKey(e.target.value);
                                }}
                            />
                        </div>

                        <div className="h-px bg-gray-700 my-2"></div>

                        <button
                            onClick={async () => {
                                if (confirm("DANGER: This will delete ALL workspaces and chats.")) {
                                    await storage.clearAll();
                                    refresh();
                                    setShowSettings(false);
                                }
                            }}
                            className="flex items-center gap-3 p-3 bg-red-900/20 hover:bg-red-900/40 rounded border border-red-900/50 transition-colors text-left text-red-400"
                        >
                            <Trash size={20} />
                            <div>
                                <div className="font-medium text-sm">Reset Extension</div>
                                <div className="text-xs text-red-300/70">Wipe clean</div>
                            </div>
                        </button>
                    </div>
                )
                }
            </div >



            {/* NEW: Workspace Settings Modal Overlay */}
            {
                editingWorkspace && (
                    <div className="absolute inset-0 bg-[#1e1f20] z-[10000] p-4 flex flex-col gap-4 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between border-b border-gray-700 pb-2">
                            <h2 className="font-semibold text-lg text-white">Workspace Settings</h2>
                            <button onClick={() => setEditingWorkspace(null)} className="hover:text-white text-gray-400"><X size={20} /></button>
                        </div>

                        {/* Name Input */}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-400">Name</label>
                            <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        {/* Prompt Input */}
                        <div className="space-y-1 flex-1 flex flex-col min-h-0">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-gray-400">Virtual Persona (System Instructions)</label>
                                {enhancingError && <span className="text-xs text-red-400">{enhancingError}</span>}
                            </div>
                            <div className="relative flex-1">
                                <textarea
                                    value={editPrompt}
                                    onChange={(e) => setEditPrompt(e.target.value)}
                                    placeholder="e.g. 'Act as a forensic accountant specializing in corporate tax...'"
                                    className="w-full h-full bg-gray-800 border border-gray-700 rounded p-3 text-sm text-gray-200 focus:border-blue-500 focus:outline-none resize-none font-mono leading-relaxed pb-10"
                                />
                                <div className="absolute bottom-2 right-2">
                                    <button
                                        onClick={handleEnhancePrompt}
                                        disabled={isEnhancing || !editPrompt}
                                        className={`text-xs flex items-center gap-1 px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm transition-all border ${isEnhancing
                                            ? 'bg-blue-900/50 border-blue-500/50 text-blue-200 cursor-wait'
                                            : 'bg-indigo-600/90 hover:bg-indigo-500 hover:scale-105 border-indigo-400/30 text-white'
                                            }`}
                                        title="Auto-Enhance with AI"
                                    >
                                        <Wand2 size={14} className={isEnhancing ? "animate-spin" : ""} />
                                        {isEnhancing ? 'Magic...' : 'Auto-Enhance'}
                                    </button>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-500">
                                This instruction will be automatically injected at the start of every new chat in this workspace.
                            </p>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSaveWorkspace}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded flex items-center justify-center gap-2 transition-colors"
                        >
                            <Save size={16} />
                            Save Changes
                        </button>
                    </div>
                )
            }
        </div >
    );
};

export default Sidebar;
