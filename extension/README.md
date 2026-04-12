# Claude Chat Exporter - Browser Extension

A browser extension that exports Claude.ai conversations with perfect markdown fidelity.

## Installation

### Chrome / Edge / Brave

1. Open `chrome://extensions` (or `brave://extensions` / `edge://extensions`)
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `extension` folder from this project

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select any file in the `extension` folder (e.g. `manifest.json`)

### Safari

Use the [Chrome/Edge version](#chrome--edge--brave) - Safari Web Extensions are supported but require additional setup through Xcode.

## Usage

1. Navigate to any conversation on [claude.ai](https://claude.ai)
2. Click the extension icon in your browser's toolbar
3. Click **Export Conversation**
4. The conversation will be downloaded as a `.md` file

## Features

- **Perfect Markdown Fidelity** - Uses Claude's native copy function
- **One-Click Export** - No need to open dev tools
- **Timestamps** - Human message timestamps included
- **Smart Filename** - Uses conversation title from API
- **Real-Time Progress** - Visual status indicator

## Files

```
extension/
├── manifest.json    # Extension configuration
├── content.js       # Main export logic (injected into claude.ai)
├── popup.html       # Toolbar popup UI
├── popup.js         # Popup functionality
└── icons/           # Extension icons
```

## Updating

To update the extension:

1. Pull the latest changes
2. Go to `chrome://extensions`
3. Click the refresh icon on the Claude Chat Exporter card

## Limitations

- Only exports messages visible on screen (scroll to load more)
- Cannot export uploaded files or images
- Requires Claude.ai to be open in a tab

## License

MIT
