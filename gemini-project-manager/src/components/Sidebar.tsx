import { useState, useEffect } from 'react';
import { Settings, X } from 'lucide-react';
import ProjectList from './ProjectList';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

const Sidebar = () => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleToggle = () => setIsOpen(prev => !prev);
        window.addEventListener('ez-files-toggle', handleToggle);
        return () => window.removeEventListener('ez-files-toggle', handleToggle);
    }, []);

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

            <div className="flex flex-col h-[calc(100vh-8rem)]">
                <ProjectList />
            </div>

            <div className="absolute bottom-0 w-full p-4 border-t border-gray-700">
                <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
                    <Settings size={18} />
                    <span>Settings</span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
