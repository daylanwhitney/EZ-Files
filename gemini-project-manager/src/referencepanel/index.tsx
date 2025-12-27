import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ReferencePanel } from '../components/ReferencePanel';
import type { Chat } from '../types';
import { storage } from '../utils/storage';

function ReferencePanelApp() {
    const [chats, setChats] = useState<Record<string, Chat>>({});
    const [loading, setLoading] = useState(true);

    // Load initial data and listen for changes
    useEffect(() => {
        const loadChats = async () => {
            try {
                const data = await storage.get();
                setChats(data.chats || {});
            } catch (err) {
                console.error("Reference Panel: Failed to load chats", err);
            } finally {
                setLoading(false);
            }
        };

        loadChats();

        // Listen for storage changes
        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            if (changes.chats) {
                setChats(changes.chats.newValue as Record<string, Chat> ?? {});
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);

        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
        };
    }, []);

    const handleClose = () => {
        window.close();
    };

    if (loading) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af'
            }}>
                Loading...
            </div>
        );
    }

    return (
        <ReferencePanel
            allChats={chats}
            onClose={handleClose}
            isFloating={true}
        />
    );
}

const root = createRoot(document.getElementById('root')!);

root.render(
    <React.StrictMode>
        <ReferencePanelApp />
    </React.StrictMode>
);
