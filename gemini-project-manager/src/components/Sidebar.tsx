import { useState, useEffect, useRef } from 'react';
import { Settings, X, Download, Upload, Trash, ChevronDown, Check, Plus, Layout, Pin } from 'lucide-react';
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
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`Delete workspace "${w.name}"?`)) deleteWorkspace(w.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400"
                                            >
                                                <Trash size={12} />
                                            </button>
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
                                <label className="text-xs text-gray-400 mb-1 block">Default Prompt</label>
                                <p className="text-[10px] text-gray-500 mb-1">Auto-injected when starting a new chat in this workspace.</p>
                                <textarea
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 min-h-[80px]"
                                    placeholder="e.g. You are a senior React developer. Always prefer functional components..."
                                    value={activeWorkspace.defaultPrompt || ''}
                                    onChange={(e) => {
                                        storage.updateWorkspaceDefaultPrompt(activeWorkspace.id, e.target.value);
                                        // Trigger a shallow refresh to update the UI local state
                                        refresh();
                                    }}
                                />
                            </div>
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


        </div >
    );
};

export default Sidebar;
