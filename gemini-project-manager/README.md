# Gemini Project Manager

A Chrome extension that adds project/folder organization to Google Gemini chats.

## Features

- **Folder Organization**: Create folders to organize your Gemini conversations
- **Drag & Drop**: Drag chats from the Gemini sidebar into your project folders
- **Quick Add**: Add the current chat to a folder with one click
- **Folder Chat**: Ask questions about all chats in a folder at once - get summaries, find patterns, or search across conversations
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

### Feature: Folder Chat - Converse About Multiple Chats (Dec 2024)

**New Feature**: Click the chat icon on any folder to ask questions about all the chats in that folder at once.

**Use Cases**:
- "Summarize all the conversations in this folder"
- "What topics are discussed across these chats?"
- "Find any mentions of [topic] in these conversations"
- "What are the key decisions made in these discussions?"

**How It Works**:
1. Click the chat bubble icon on a folder to open Folder Chat
2. The system aggregates content from all indexed chats in the folder
3. Your question is sent to Gemini along with the combined context
4. Gemini responds based on the full context of all chats

**Performance Optimizations** (Dec 2024):
- Combined context + query into single prompt (saves ~7-13s)
- Faster response detection with 300ms polling (was 500ms)
- Session reuse - hidden window stays open for follow-up messages
- Auto-cleanup of idle sessions after 5 minutes

**Technical Details**:
- `FolderChatService` manages background chat sessions
- Content script automates Gemini interactions in a hidden window
- Sessions persist across messages for faster follow-ups
- First message: ~10-15 seconds, follow-up messages: ~5-10 seconds

### Feature: Automatic Chat Indexing on Drag & Drop (Dec 2024)

**New Feature**: Chats are now automatically indexed when dropped into a folder, making them immediately searchable and readable by AI.

**How It Works**:
1. When you drag a chat from Gemini's sidebar to a folder, the system captures the chat title
2. Since Gemini's DOM doesn't expose chat IDs directly, a temporary hash-based ID is created
3. The content script performs **in-page discovery** by:
   - Finding the chat by title in the sidebar
   - Clicking it to navigate (within the same tab - no new tabs!)
   - Extracting the real chat ID from the URL
   - Migrating the hash-based ID to the real ID in storage
   - Scraping and saving the chat content
   - Navigating back to the original chat
4. The chat is now fully indexed with its real ID and content

**Key Implementation Details**:
- `IndexingQueue` class manages background indexing tasks
- In-page discovery avoids opening new browser tabs
- `findChatElement()` locates chats by title in the sidebar
- `storage.migrateHashToRealId()` updates folder memberships when real ID is discovered
- Extension context validation prevents errors when extension is reloaded

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
