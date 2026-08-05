# Claude Chat Exporter

A JavaScript tool that exports Claude.ai conversations with **perfect markdown fidelity** by reading them straight from Claude's own internal API — the same endpoint the app itself uses. Get complete conversations with both human and AI messages including tables, math, code, and every element Claude supports, always in the right order. It runs entirely in your browser — the tool has **no server of its own**, and the only network call is to Claude's own backend (for your conversation), using your existing session.

<p align="center">
  <a href="https://agarwalvishal.github.io/claude-chat-exporter/">
    <img src="https://img.shields.io/badge/▶%20Install-One--Click%20Bookmarklet-d97757?style=for-the-badge" alt="Install the one-click bookmarklet" />
  </a>
</p>

## ⚡ One-Click Export (Bookmarklet)

The easiest way — no console, no copy-paste, works for non-developers too:

1. Open the **[one-click install page »](https://agarwalvishal.github.io/claude-chat-exporter/)**
2. **Drag** the “📥 Claude Export” button onto your browser's bookmarks bar.
3. Open any conversation on [claude.ai](https://claude.ai) and **click the bookmark** — your `.md` file downloads automatically.

The bookmarklet is just this repository's open-source script wrapped into a link. It runs entirely in your browser — the tool has **no server of its own**, the only network call for your conversation is to Claude's own backend, and it stores nothing. The bookmarklet also checks for updates and shows an “update available” notice when a newer version is published, so you can re-drag to grab the latest.

Prefer to run it yourself? See [Usage (Console)](#usage-console) below.

## Features

- **🎯 Perfect Markdown Fidelity** - Reads Claude's own source markdown from its API — no HTML parsing, no conversion. The result is a clean, faithful document that reads beautifully on its own
- **📈 Complete Element Support** - Tables, math, code, lists, complex formatting — everything, byte-perfect
- **🧩 Artifacts, Files & Widgets** - Artifacts (their final version), created files, and charts/diagrams are exported as clean fenced code blocks, in place and in order
- **📎 Attachments** - Uploaded images embedded, documents linked, and text files inlined — exports stay self-contained
- **🗂️ Obsidian- & RAG-ready** - YAML frontmatter + one heading per turn means it drops straight into an Obsidian vault or an AI/RAG pipeline — not just a plain dump ([more below](#obsidian--rag-ready))
- **📊 Complete & In Order** - Every message on the current branch, correctly ordered — even in long conversations that only partly render on screen
- **🕐 Timestamps** - Per-message timestamps for both human and Claude turns, from Claude's API
- **🔒 Private by Design** - No servers, no tracking; runs in your browser and only ever calls Claude's own backend, over your existing session
- **📁 Smart Filename Generation** - Uses the actual conversation title from the API
- **🛡️ Robust to UI Changes** - Reads a stable data contract, not fragile CSS selectors

## How It Works

It's a single fetch, transformed into markdown:

1. **Fetch** - Calls Claude's internal API for the current conversation (`/api/organizations/{orgId}/chat_conversations/{conversationId}`), authenticated by your existing session cookie. The response contains the title and every message.
2. **Order** - Reconstructs the conversation's current branch by walking the message tree from the current leaf up its parent chain (so a regenerated response exports exactly what's on screen).
3. **Extract** - Walks each message's content blocks in order: `text` blocks (Claude's original source markdown) plus special elements — artifacts, created files, and charts/diagrams/widgets — rendered in position; hidden/system messages are skipped.
4. **Output** - Writes a single markdown file: YAML frontmatter (title, source, model, export date) followed by one `#`-level header per turn (`# Human — …` / `# Claude — …`) so Claude's own `##`/`###` content nests correctly beneath it. The result is a clean, faithful document that reads perfectly on its own — and the same structure makes it drop-in ready for [Obsidian & AI/RAG pipelines](#obsidian--rag-ready).

> **Branches / regenerated responses:** the export follows the branch Claude is currently showing — its *active leaf* — not necessarily the newest one. If you've regenerated a response and want to export a **different** branch, switch to that version in Claude first (the `‹ ›` arrows on a regenerated message), then run the exporter — the switch takes effect immediately, no page reload needed.

### Why read the API instead of the page?

Claude *generates* markdown, and the page only ever holds a small window of a long conversation in the DOM. Copy buttons hand over that markdown faithfully — but the DOM was still needed to *find* each message, work out who said it, and read the conversation title, and each of those is a CSS selector waiting to break. Reading the API gets **every message's source markdown directly**, along with the elements no copy button can reach.

```
❌ Driving the page (DOM + copy buttons):
- Only sees the messages currently rendered → long chats export partially
- Pairs human and Claude turns by index → a regenerated branch can misalign them
- Reaches only what has a copy button → no artifacts, files or attachments
- Couples to CSS selectors that change constantly → a maintenance nightmare

✅ Reading Claude's API:
- Complete conversation, always, in the order it appears on screen
- Claude's original source markdown → perfect fidelity, zero conversion
- Artifacts, created files, widgets and attachments come along too
- A stable data contract instead of brittle selectors
```

## Usage (Console)

Prefer running it yourself, or want to tweak the script? Run it straight from the browser console:

1. Open your conversation with Claude in your web browser.
2. Open the browser's developer console:
   - Chrome/Edge: Press F12 or Ctrl+Shift+J (Windows/Linux) or Cmd+Option+J (Mac)
   - Firefox: Press F12 or Ctrl+Shift+K (Windows/Linux) or Cmd+Option+K (Mac)
   - Safari: Enable the Develop menu in preferences, then press Cmd+Option+C
3. Copy the entire script in the file `claude-chat-exporter.js` and paste it into the console.
   - **First time?** Chrome, Edge, and Firefox block pasting into the console as a safety measure. If you see that warning, type `allow pasting`, press Enter, then paste the script again. (Only needed once per browser profile — the one-click bookmarklet skips this entirely.)
4. Press Enter to run the script.
5. The script shows a small status indicator and automatically downloads a file named `{conversation-title}.md` (`conversation-title` being the Claude conversation title from the API).

## Complete Element Support

Because this reads Claude's source markdown directly, it automatically handles:

- ✅ **Tables** - Perfect markdown table formatting
- ✅ **Math** - LaTeX and inline math notation
- ✅ **Code blocks** - With proper language detection
- ✅ **Lists** - Nested lists with correct formatting
- ✅ **Links** - All link types and formats
- ✅ **Formatting** - Bold, italic, strikethrough, etc.
- ✅ **Blockquotes** - Proper quote formatting
- ✅ **Headers** - All heading levels
- ✅ **Artifacts** - Exported as a labelled fenced code block (final version), in place
- ✅ **Created files** - `create_file` outputs, as a fenced code block with the filename
- ✅ **Charts / diagrams / widgets** - `visualize` widgets exported as code (mermaid renders natively in Obsidian)
- ✅ **Attachments** - Images embedded, documents linked, text files inlined
- ✅ **Future elements** - Automatically supported

## File Output

- **Filename**: `{conversation-title}.md` (from the API title, else `claude_conversation`)
- **Format**: YAML frontmatter + `#`-per-turn headers; bodies are Claude's own source markdown
- **Content**: Complete conversation, in order, with per-message timestamps and inlined text-attachment content
- **Encoding**: UTF-8 with standard line endings

## Example Output

YAML frontmatter carries document metadata; each turn is an `#` header so Claude's own `##`/`###` headings nest beneath it. Attachments render above the text (text attachments are blockquoted, label and all); artifacts, created files, and widgets render in place as labelled fenced code blocks:

````markdown
---
title: "Sorting algorithm comparison"
source: "https://claude.ai/chat/…"
model: "claude-opus-4-…"
exported: 2026-02-23
---

# Human — Feb 23, 2026, 10:30 AM

> **Attachment: requirements.md · text/markdown · 1.2 KB**
>
> # Requirements
> Compare the common sorting algorithms in a table.

Can you create a comparison table, and a small React widget to visualise it?

# Claude — Feb 23, 2026, 10:30 AM

Here's the comparison and an interactive sorter:

| Algorithm  | Best       | Average    | Worst      | Stable |
| ---------- | ---------- | ---------- | ---------- | ------ |
| Merge Sort | O(n log n) | O(n log n) | O(n log n) | Yes    |

**Artifact: Sorting Visualiser · React**

```jsx
export default function Sorter() {
  return <div>…</div>;
}
```

# Human — Feb 23, 2026, 10:32 AM

Now make it animated —

# Claude — Feb 23, 2026, 10:32 AM

Sure, adding an animation loop…

> **Interrupted:** this response was stopped before Claude finished.
````

(The artifact shows its **final** version once; the `Interrupted` note appears only when a response was stopped. Everything is the source markdown Claude wrote — tables, code, and all — byte-for-byte.)

## Obsidian & RAG ready

First and foremost the export is a **clean, faithful Markdown document** — exactly the markdown Claude wrote, so it reads perfectly on its own. But unlike a plain dump, its structure is deliberately built to drop straight into your knowledge tools:

- **YAML frontmatter** (`title`, `source`, `model`, `exported`) → Obsidian reads it as note **properties**; a RAG pipeline attaches it as per-document **metadata** on every chunk.
- **One `#` heading per turn** → each Human/Claude turn is a clean top-level section, so heading-aware **RAG chunkers split neatly by turn**, and Claude's own `##`/`###` content nests *beneath* the turn instead of colliding with it.
- **Blockquoted attachment text** → an attached doc's headings stay quoted, keeping your outline intact while the content stays fully searchable.
- **Mermaid artifacts** render as **live diagrams** in Obsidian.
- **Emoji-free body** → clean, consistent tokens for embeddings and search.

Drop the `.md` into your vault or ingestion pipeline and it just works — no cleanup step. That structure is a real edge over exporters that hand you an unstructured wall of text.

## Maintenance

The script is **fully DOM-free** and the export is a single API read — there's nothing to configure. The one point of coupling is the shape of Claude's API response, handled in `getOrderedMessages()` / `renderToolUse()`: if Claude ever changes that response (or adds a new tool type), those functions are where to update, and the expected shape is documented in [`CLAUDE.md`](CLAUDE.md).

## Browser Compatibility

- ✅ Chrome/Chromium (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Edge

_Works in any modern browser while you're logged in to claude.ai._

## Troubleshooting

### Export Status Indicators

The script shows a small status box while it runs:

- `Fetching conversation…` - Reading the conversation from Claude's API
- `✅ Exported N messages: filename.md` - Success!
- `✅ Exported N messages (1 interrupted response): filename.md` - Success. A response was stopped before Claude finished, so there was never any more of it to export — **your file is complete**. The message is flagged inline so the short answer isn't mistaken for a bug
- `⚠️ Exported N messages (1 message flagged truncated): filename.md` - Claude's API marked a message `truncated`. It's flagged inline; compare that message against the page if you want to be sure nothing is missing
- `⚠️ Exported N messages (1 warning — see console): filename.md` - The file downloaded, but something didn't reconstruct cleanly — usually an artifact whose edit couldn't be applied to its original text, occasionally an unexpected value from the API. Each warning is logged to the console as it happens
- `Error: …` - The export didn't happen, and the box itself says why — e.g. `Open a specific Claude conversation first…` or `your session may have expired; reload and sign in`. The console logs the full error too

### Common Issues

**Could not fetch conversation data**

- Make sure you're logged in to claude.ai and the conversation URL is open
- Reload the page and run again

**No messages found**

- The conversation may be empty, or still opening — reload and retry

You do **not** need to scroll the conversation first — the whole thread is read from the API regardless of what's rendered on screen.

## Technical Architecture

The whole script is one closure, `setupClaudeExporter()`, running a small pipeline: `fetchConversationData()` → `getOrderedMessages()` → `buildMarkdown()` → download.

### The API response

```
GET /api/organizations/{orgId}/chat_conversations/{conversationId}?tree=true&rendering_mode=messages&render_all_tools=true
```

`orgId` comes from the `lastActiveOrg` cookie, `conversationId` from the URL path; the request is same-origin and uses your session cookie. The relevant response shape:

```jsonc
{
  "name": "…",                       // conversation title
  "model": "…",                      // e.g. claude-opus-5 (frontmatter)
  "current_leaf_message_uuid": "…",  // tip of the current branch
  "chat_messages": [{
    "uuid": "…", "parent_message_uuid": "…",  // tree links
    "index": 0,                               // fallback ordering
    "sender": "human" | "assistant",
    "created_at": "…",                        // ISO timestamp
    "truncated": false,
    "content": [{ "type": "text" | "thinking" | "tool_use" | "tool_result", "text": "…" }],
    "files": [ /* uploaded images/docs */ ], "attachments": [ /* text extractions */ ]
  }]
}
```

`tool_use` blocks carry `name` + `input`; the exporter renders `artifacts`, `create_file`,
and `visualize:show_widget` from their `input`. The full field-level contract (files,
attachments, and each tool's `input` shape) is documented in [`CLAUDE.md`](CLAUDE.md).

### Ordering (current branch)

Messages form a tree. `getOrderedMessages()` follows the branch actually on screen by walking from `current_leaf_message_uuid` up the `parent_message_uuid` chain and reversing, falling back to sorting by `index`:

```javascript
let cur = byUuid.get(data.current_leaf_message_uuid);
while (cur) { path.push(cur); cur = byUuid.get(cur.parent_message_uuid); }
path.reverse();
```

### Content extraction

Each message's `content` interleaves typed blocks. We walk them **in order**, emitting `text` blocks plus content-bearing `tool_use` blocks (via `renderToolUse`), so text and special elements stay interleaved as written; `thinking` and `tool_result` blocks are skipped, as are messages that end up empty:

```javascript
const parts = [];
for (const block of (m.content || [])) {
  if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text.trim());
  else if (block.type === 'tool_use') parts.push(renderToolUse(block, artifacts));
}
```

`renderToolUse` renders **artifacts**, **created files** (`create_file`), and **charts/diagrams/widgets** (`visualize:show_widget`) as titled fenced code blocks with a kind label (`Artifact:` / `File:` / `Widget:`; language mapped from type/extension; `mermaid` renders natively in Obsidian). Artifacts are reconstructed to their final version (folding create + edits) and rendered once, at their last edit. **Every other tool** — web search, bash, file view/edit, display widgets — is skipped.

This is Claude's original source markdown, so tables/math/code are byte-perfect with no conversion.

## Advantages Over Other Methods

| Method                        | Accuracy | Completeness            | Maintenance |
| ----------------------------- | -------- | ----------------------- | ----------- |
| **This Script (API)**         | 100%     | Whole conversation      | Low         |
| Manual Copy/Paste             | 100%     | Whatever you scroll to  | N/A         |
| DOM scraping / copy buttons   | ~high    | Only rendered messages  | High        |
| HTML → markdown parsers       | ~80%     | Only rendered messages  | High        |

## Privacy & Security

- **No Backend of Its Own** - This tool runs no servers; your conversations are never sent to us or any other party
- **Runs in Your Browser** - All processing happens locally on your machine
- **Claude's Own API Only** - The single request reads *your* conversation from Claude's own backend, over your existing session — the same data claude.ai already loads for you
- **No Data Storage** - Messages are transformed and downloaded immediately; nothing is retained

The bookmarklet additionally fetches its own script and an update check from GitHub — these read public files and send none of your conversation data.

## Limitations

- **Requires JavaScript** - Must be enabled in browser
- **Claude Web Only** - Works only on claude.ai web interface, while you're logged in
- **Undocumented API** - Relies on Claude's internal API; a change to its response shape would require an update (rare, and far less brittle than CSS selectors)
- **Special elements** - Artifacts (their final version), created files, and charts/diagrams/widgets are exported as fenced code blocks. Not exported: other tool calls (web search, bash, file view/edit), display widgets (maps, recipes, image/place search — their result URLs are ephemeral), and Claude's internal thinking blocks (excluded by design — exploratory reasoning and discarded hypotheses pollute RAG retrieval and the document outline)
- **Attachments** - Every attachment is represented, above the text: **images** embedded, **documents** (PDF) linked (`document · N pages`), **blobs** (audio, etc.) named, and **text attachments** (.md/.docx/.txt/.html) inlined as a blockquote of their extracted text — so exports stay self-contained and RAG-complete. Not exported: the raw *binary* bytes (image/PDF/audio), and file links are auth-gated claude.ai URLs that load only while signed in to the same account. A portable ZIP that bundles the binary originals is a possible future addition

## Contributing

Contributions to improve the script or add new features are welcome! Please feel free to submit a pull request or open an issue to discuss potential changes.

This project benefits from:

1. **API Contract Updates** - Help keep `getOrderedMessages()` in sync if Claude's API response changes
2. **Error Handling** - Improve robustness for edge cases
3. **Additional Content** - Richer display-widget rendering, or bundling binary attachment/file originals

## License

This project is open source and available under the [MIT License](LICENSE).

## Disclaimer

This script is not officially associated with Anthropic or Claude AI. It is a community-created tool to enhance the user experience. Use it responsibly and in accordance with Anthropic's terms of service.

---

**Perfect Exports. Every Element. Every Time.**

_Made for the Claude community - if this helps you, give it a ⭐!_
