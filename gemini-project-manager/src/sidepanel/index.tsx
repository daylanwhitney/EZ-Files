import React from 'react';
import { createRoot } from 'react-dom/client';
import Sidebar from '../components/Sidebar';
import '../index.css';

const root = createRoot(document.getElementById('root')!);

root.render(
    <React.StrictMode>
        <div className="h-screen w-full flex flex-col">
            <Sidebar isSidePanel={true} />
        </div>
    </React.StrictMode>
);
