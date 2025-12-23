import { useState, useEffect, useRef } from 'react';
import { Settings, X, Download, Upload, Trash } from 'lucide-react';
import ProjectList from './ProjectList';
import { storage } from '../utils/storage';
import { useProjects } from '../hooks/useProjects';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

const Sidebar = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { importData, refresh } = useProjects();

    useEffect(() => {
        const handleToggle = () => setIsOpen(prev => !prev);
        window.addEventListener('ez-files-toggle', handleToggle);
        return () => window.removeEventListener('ez-files-toggle', handleToggle);
    }, []);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const content = ev.target?.result as string;
            await importData(content);
            setShowSettings(false);
        };
        reader.readAsText(file);
    };

    return (
        <div
            className={cn(
                "fixed top-0 right-0 h-screen bg-[#1e1f20] text-gray-200 transition-transform duration-300 z-[9999] border-l border-gray-700 font-sans shadow-xl pointer-events-auto",
                isOpen ? "translate-x-0 w-80" : "translate-x-full w-80"
            )}
        >
            <div className="flex items-center justify-between p-4 border-b border-gray-700 h-16">
                <h1 className="font-semibold text-lg">My Projects</h1>
                <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-gray-700 rounded-md transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Main Content or Settings View */}
            {!showSettings ? (
                <>
                    <div className="flex flex-col h-[calc(100vh-8rem)]">
                        <ProjectList />
                    </div>
                    <div className="absolute bottom-0 w-full p-4 border-t border-gray-700">
                        <button
                            onClick={() => setShowSettings(true)}
                            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                        >
                            <Settings size={18} />
                            <span>Settings</span>
                        </button>
                    </div>
                </>
            ) : (
                <div className="p-4 flex flex-col gap-4 h-[calc(100vh-4rem)] overflow-y-auto">
                    <button
                        onClick={() => setShowSettings(false)}
                        className="text-sm text-gray-400 hover:text-white flex items-center gap-1 mb-2"
                    >
                        ← Back
                    </button>

                    <h2 className="font-semibold text-white">Data Management</h2>

                    <button
                        onClick={() => storage.exportData()}
                        className="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded border border-gray-600 transition-colors text-left"
                    >
                        <Download size={20} className="text-blue-400" />
                        <div>
                            <div className="font-medium text-sm">Backup Data</div>
                            <div className="text-xs text-gray-400">Export projects to JSON</div>
                        </div>
                    </button>

                    <button
                        onClick={handleImportClick}
                        className="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded border border-gray-600 transition-colors text-left"
                    >
                        <Upload size={20} className="text-green-400" />
                        <div>
                            <div className="font-medium text-sm">Restore Data</div>
                            <div className="text-xs text-gray-400">Import from backup file</div>
                        </div>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".json"
                    />

                    <div className="h-px bg-gray-700 my-2"></div>

                    <button
                        onClick={async () => {
                            if (confirm("Are you sure? This will delete ALL folders and saved chats.")) {
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
                            <div className="text-xs text-red-300/70">Delete all data</div>
                        </div>
                    </button>
                </div>
            )}
        </div>
    );
};

export default Sidebar;
