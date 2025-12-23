# Gemini Project Manager

A Chrome extension that adds project/folder organization to Google Gemini chats.

## Features

- **Folder Organization**: Create folders to organize your Gemini conversations
- **Drag & Drop**: Drag chats from the Gemini sidebar into your project folders
- **Quick Add**: Add the current chat to a folder with one click
- **Persistent Storage**: All data saved locally via Chrome storage API
- **Seamless Integration**: Sidebar integrates naturally with Gemini's UI

## Installation

1. Clone or download this repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the extension
4. Open Chrome and navigate to `chrome://extensions`
5. Enable "Developer mode" (toggle in top right)
6. Click "Load unpacked" and select the `dist` folder

## Usage

1. Navigate to [Google Gemini](https://gemini.google.com)
2. Click the "Projects" button in the sidebar (or the floating button if sidebar isn't detected)
3. Create folders using the "+ New Project" button
4. Drag chats from Gemini's sidebar into your folders, or use the "+" button on a folder to add the current chat

## Development

```bash
# Install dependencies
npm install

# Development build with watch
npm run dev

# Production build
npm run build

# Type checking
npm run typecheck
```

## Tech Stack

- React 19 + TypeScript
- Vite for bundling
- Tailwind CSS for styling
- Chrome Extension Manifest V3

## Recent Changes

### Bug Fix: Drag & Drop Chat Replacement Issue (Dec 2024)

**Problem**: When dragging a chat to a folder that already contained chats, the new chat would replace existing chats instead of being added alongside them.

**Root Cause**: The ID extraction logic was incorrectly selecting container elements (`conversation-items-container`) instead of individual chat items. These containers had a generic `data-testid="conversation"` attribute, causing ALL chats to receive the same ID. When adding a second chat:
1. The system detected `chatId: "conversation"` already existed
2. It only updated metadata instead of adding a new entry
3. This caused the replacement behavior

**Solution**: 
- Added a `generateTitleHash()` function that creates unique, deterministic IDs based on chat titles
- When no real Gemini ID can be extracted from the DOM, the system now generates a hash-based ID
- Each unique chat title now gets its own unique ID (e.g., `chat_abc123`)
- Multiple chats can now coexist in folders correctly

## License

MIT
