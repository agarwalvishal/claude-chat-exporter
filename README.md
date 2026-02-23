# Claude Chat Exporter

A JavaScript tool that exports Claude.ai conversations with **perfect markdown fidelity** by leveraging Claude's native copy functionality. Get complete conversations with both human and AI messages including tables, complex formatting, and all elements that Claude supports.

## Features

- **🎯 Perfect Markdown Fidelity** - Uses Claude's copy function for exact output
- **📊 Complete Element Support** - Tables, math, complex formatting, everything
- **🕐 Timestamps** - Human message timestamps fetched from Claude's API
- **📁 Smart Filename Generation** - Uses actual conversation title from API
- **🔧 Future-Proof** - Automatically supports new Claude markdown features
- **📈 Real-Time Status** - Visual progress indicator during export
- **🛡️ Robust Error Handling** - Comprehensive error detection and recovery
- **⚙️ Easy Maintenance** - Modular selectors for UI changes

## How It Works

1. **Fetch Metadata** - Calls Claude's internal API to retrieve the conversation title and per-message timestamps before anything is clicked
2. **Human Messages** - Identifies human message action bars (those *without* a thumbs-up feedback button) and clicks their copy buttons; captures each clipboard write via an intercepted `navigator.clipboard.writeText`
3. **Claude Responses** - Identifies Claude response action bars (those *with* a thumbs-up feedback button) and clicks their copy buttons; captures each clipboard write the same way
4. **Perfect Output** - Combines both sets of captured content into a single markdown file, with timestamps on human message headers when available

### Why Copy Button Approach?

Instead of manually parsing HTML and converting to markdown (which misses tables and complex elements), this tool uses **Claude's own copy button** to ensure 100% accurate markdown output for all message types.

```
❌ Manual HTML Parsing:
- Misses tables and complex elements
- Requires constant updates for new features
- Error-prone formatting conversion
- Maintenance nightmare

✅ Copy Button Method:
- Perfect markdown fidelity
- Automatic support for ALL elements
- Future-proof against new features
- Zero formatting edge cases
```

## Usage

1. Open your conversation with Claude in your web browser.
2. Open the browser's developer console:
   - Chrome/Edge: Press F12 or Ctrl+Shift+J (Windows/Linux) or Cmd+Option+J (Mac)
   - Firefox: Press F12 or Ctrl+Shift+K (Windows/Linux) or Cmd+Option+K (Mac)
   - Safari: Enable the Develop menu in preferences, then press Cmd+Option+C
3. Copy the entire script in the file `claude-chat-exporter.js` and paste it into the console.
4. Press Enter to run the script.
5. The script will show a progress indicator and will automatically generate and download a file named `{conversation-title}.md` (auto-generated with `conversation-title` being the Claude conversation title).

## Complete Element Support

Because this uses Claude's copy function, it automatically handles:

- ✅ **Tables** - Perfect markdown table formatting
- ✅ **Math** - LaTeX and inline math notation
- ✅ **Code blocks** - With proper language detection
- ✅ **Lists** - Nested lists with correct formatting
- ✅ **Links** - All link types and formats
- ✅ **Formatting** - Bold, italic, strikethrough, etc.
- ✅ **Blockquotes** - Proper quote formatting
- ✅ **Headers** - All heading levels
- ✅ **Future elements** - Automatically supported

## File Output

- **Filename**: `{conversation-title}.md` (from API, falls back to DOM)
- **Format**: Perfect markdown matching Claude's copy output
- **Content**: Complete conversation with proper spacing and timestamps
- **Encoding**: UTF-8 with standard line endings

## Example Output

The output is **identical** to what you get when copying Claude messages manually, with timestamps added to human message headers:

```markdown
# Conversation with Claude

## Human (Feb 23, 2026, 10:30 AM):

Can you create a comparison table of sorting algorithms?

---

## Claude:

Here's a comprehensive comparison table of sorting algorithms:

| Algorithm   | Best Case  | Average Case | Worst Case | Space    | Stable |
| ----------- | ---------- | ------------ | ---------- | -------- | ------ |
| Bubble Sort | O(n)       | O(n²)        | O(n²)      | O(1)     | Yes    |
| Quick Sort  | O(n log n) | O(n log n)   | O(n²)      | O(log n) | No     |
| Merge Sort  | O(n log n) | O(n log n)   | O(n log n) | O(n)     | Yes    |

**Key advantages:**

- Tables render perfectly ✅
- Math notation preserved ✅
- All formatting maintained ✅

---
```

## Configuration

### Performance Tuning

Adjust the delay between copy button clicks in the `DELAYS` object:

```javascript
const DELAYS = {
  copy: 100, // Delay between copy button clicks in ms (increase if messages are missed)
};
```

Increasing `copy` can help on slower machines or when the page is under load. Decreasing it speeds up export but may cause clipboard writes to be missed.

### UI Selector Updates

If Claude's interface changes, update the `SELECTORS` object:

```javascript
const SELECTORS = {
  copyButton: 'button[data-testid="action-bar-copy"]',
  conversationTitle: '[data-testid="chat-title-button"] .truncate, button[data-testid="chat-title-button"] div.truncate',
  messageActionsGroup: '[role="group"][aria-label="Message actions"]',
  feedbackButton: 'button[aria-label="Give positive feedback"]'
};
```

The `feedbackButton` selector is what distinguishes Claude's action bars from human message action bars — it only appears on Claude's responses.

## Performance Metrics

- **Execution Time**: 3-8 seconds for 10-message conversations
- **Success Rate**: >95% with optimized delays
- **Element Support**: 100% (matches Claude's copy functionality)
- **Memory Usage**: Minimal (no large DOM processing)

## Browser Compatibility

- ✅ Chrome/Chromium (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Edge

_Requires clipboard API support (available in all modern browsers)_

## Troubleshooting

### Export Status Indicators

The script shows real-time progress:

- `Fetching conversation data...` - Retrieving title and timestamps from API
- `Copying human messages...` - Clicking human message copy buttons
- `Copying Claude responses...` - Clicking Claude response copy buttons
- `Human: X | Claude: Y` - Live capture counts
- `✅ Downloaded: filename.md` - Success!

### Common Issues

**No Messages Captured**

- Ensure conversation is fully loaded
- Check that messages are visible on screen
- Try scrolling through entire conversation first

**Partial Export**

- Script shows exact counts: "Human: 3 | Claude: 2"
- If mismatch, some messages may not be accessible
- Try refreshing page and running again

## Technical Architecture

### Two-Phase Copy Button Capture

Human and Claude message action bars are structurally identical except that Claude's bars include a thumbs-up feedback button. `getCopyButtons` uses this to filter:

```javascript
function getCopyButtons(claudeOnly) {
  const actionGroups = document.querySelectorAll(SELECTORS.messageActionsGroup);
  const buttons = [];
  actionGroups.forEach(group => {
    const hasFeedback = !!group.querySelector(SELECTORS.feedbackButton);
    if (hasFeedback === claudeOnly) {
      const copyBtn = group.querySelector(SELECTORS.copyButton);
      if (copyBtn) buttons.push(copyBtn);
    }
  });
  return buttons;
}
```

`startExport` then runs two sequential phases, switching `currentCapture` between `humanMessages` and `capturedResponses` so the clipboard interceptor routes each write to the right array:

```javascript
// Phase 1: Human messages
currentCapture = humanMessages;
await triggerCopyButtons(humanButtons);
await waitForClipboardOperations(humanMessages, humanButtons.length);

// Phase 2: Claude responses
currentCapture = capturedResponses;
await triggerCopyButtons(claudeButtons);
await waitForClipboardOperations(capturedResponses, claudeButtons.length);
```

### Clipboard Interception

```javascript
navigator.clipboard.writeText = function(text) {
  if (interceptorActive && text) {
    const type = currentCapture === humanMessages ? 'user' : 'claude';
    currentCapture.push({ type, content: text });
  }
};
```

### Timestamp Matching

Timestamps are fetched from Claude's internal API and stored in a `Map<content → timestamp>`. Matching by content (rather than by index) ensures correctness even when the API returns hidden or system messages alongside visible ones:

```javascript
const ts = timestamps?.get(humanMessages[i].content?.trim());
const header = ts ? `## Human (${ts}):` : `## Human:`;
```

## Advantages Over Manual Methods

| Method               | Accuracy | Speed     | Maintenance | Future-Proof |
| -------------------- | -------- | --------- | ----------- | ------------ |
| **This Script**      | 100%     | Fast      | Low         | Yes          |
| Manual Copy/Paste    | 100%     | Very Slow | N/A         | Yes          |
| HTML Parsing Scripts | ~80%     | Fast      | High        | No           |

## Contributing

Contributions to improve the script or add new features are welcome! Please feel free to submit a pull request or open an issue to discuss potential changes.

This project benefits from:

1. **Selector Updates** - Help maintain compatibility with UI changes
2. **Performance Tuning** - Optimize delays for different browsers
3. **Error Handling** - Improve robustness for edge cases
4. **Handling Additional Elements** - Handle exporting artifacts, attachments, etc.

## Limitations

- **Requires JavaScript** - Must be enabled in browser
- **Claude Web Only** - Works only on claude.ai web interface
- **Susceptible to DOM changes** - Interface changes may require updates to CSS selectors
- **Visible Messages** - Only exports messages visible in DOM
- **No Attachments** - Cannot export uploaded files or images
- **No Artifacts** - Artifact content is currently skipped

## Privacy & Security

- **Local Processing** - Everything runs in your browser
- **Same-Origin API Only** - Fetches metadata from Claude's own backend using your existing session; no third-party services involved
- **Temporary Interception** - Clipboard restored after export
- **No Data Storage** - Messages processed and downloaded immediately

## License

This project is open source and available under the [MIT License](LICENSE).

## Disclaimer

This script is not officially associated with Anthropic or Claude AI. It is a community-created tool to enhance the user experience. Use it responsibly and in accordance with Anthropic's terms of service.

---

**Perfect Exports. Every Element. Every Time.**

_Made for the Claude community - if this helps you, give it a ⭐!_
