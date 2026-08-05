# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file browser-console script (`claude-chat-exporter.js`) that exports a claude.ai conversation to a markdown file. It runs by pasting the whole file into the browser devtools console while a conversation is open (a one-click bookmarklet in `docs/index.html` wraps the same script). There is **no build system, package manager, test suite, or lint config** — the repo is the script, its README, the bookmarklet page, and a LICENSE.

To test a change: `node --check claude-chat-exporter.js` for syntax, then paste the edited script into the console on a real claude.ai conversation and observe the on-page status indicator and downloaded `.md` file.

## Core design decision

The script does **not** scrape or parse the DOM, and does **not** convert HTML to markdown. It reads the conversation directly from claude.ai's own **internal API**, whose response already contains each message's **source markdown** (tables, math, code, etc.) — so fidelity is byte-perfect with zero conversion logic. Any proposed change that reintroduces DOM scraping, clipboard/copy-button capture, or HTML→markdown parsing works against the entire point of the project — reject that direction.

(Historical note: earlier versions clicked Claude's "copy" buttons and intercepted the clipboard. That was replaced because it only saw the DOM's *virtualized* window — long conversations exported partially and out of order — and coupled the script to constantly-changing CSS selectors. The API returns the same markdown, complete and ordered, and is far more stable. See git history.)

## How the export works

The whole flow lives in `setupClaudeExporter()` (one closure, invoked at the bottom) and is a straight pipeline — one fetch, transform, download:

1. **`fetchConversationData()`** — same-origin GET to the internal endpoint
   `/api/organizations/{orgId}/chat_conversations/{conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`,
   authenticated by the user's existing session cookie. `conversationId` comes from the URL path; `orgId` from the `lastActiveOrg` cookie.

2. **`getOrderedMessages(data)`** — turns the response into an ordered `[{ sender, text, created_at, truncated, stop_reason }]`:
   - **Ordering** follows the *current branch*: walk from `data.current_leaf_message_uuid` up the `parent_message_uuid` chain and reverse (so a regenerated response exports the path actually on screen). Falls back to sorting `chat_messages` by `index`.
   - **Content**: each message's `content` is an array of typed blocks (`text`, `thinking`, `tool_use`, `tool_result`). Walk them **in order** — emit `text` blocks and `tool_use` blocks (via `renderToolUse`), skip `thinking`/`tool_result` — so text and special elements stay interleaved. Messages that end up empty are dropped (the API also returns hidden/system messages the UI never shows). `renderToolUse` renders only the three content-bearing tools (`artifacts`→`content`, `create_file`→`file_text`, `visualize:show_widget`→`widget_code`) as titled fenced code blocks with an API-derived kind label (`Artifact:` / `File:` / `Widget:`, no emoji); **every other tool** (web search, bash, file view/edit, display widgets, unknown) is skipped (their names are logged once at `console.debug` — hidden from users, but a maintainer can enable "Verbose" to spot a new content tool to add). Artifacts are special — `collectArtifacts` folds each `id` through `create` / `update` (an `old_str`→`new_str` diff) / `rewrite` into its final content, and it's rendered **once, at its last edit** (matched by `version_uuid`).

3. **`buildMarkdown(messages)`** — emits YAML frontmatter (`title`, `source`, `model`, `exported`) then one `# Human — <timestamp>` / `# Claude — <timestamp>` header per turn (H1 so Claude's own `##`/`###` content nests beneath it — keeps the outline correct for RAG chunking and Obsidian). No separate title heading or `---` rules. Appends an inline word-based notice to **incomplete** messages via `incompleteNote()`, flagging the two signals verified in the API — `truncated` → **Truncated**, `stop_reason: 'user_canceled'` → **Interrupted** (everything else, incl. a rare length-limited response, is left unannotated rather than guessing an unverified `stop_reason` value). The exported document is **emoji-free**; emojis appear only in the transient status box / console. Tuned for RAG/Obsidian ingestion.

4. **Title + download** — `getConversationTitle()` uses `conversationData.name` (falls back to `'claude_conversation'`; fully DOM-free), then `downloadMarkdown()` writes the `.md` file.

## The API response contract (the thing to know for maintenance)

```
{
  name,                          // conversation title
  model,                         // e.g. "claude-opus-5" — used in the frontmatter
  current_leaf_message_uuid,     // tip of the current branch (drives ordering)
  chat_messages: [{
    uuid, parent_message_uuid,   // tree links (used to reconstruct the current path)
    index,                       // fallback ordering
    sender: 'human' | 'assistant',
    created_at,                  // ISO timestamp
    truncated,                   // bool; rare source-data content truncation → inline "Truncated" note
    stop_reason,                 // assistant only: 'end_turn'/'stop_sequence' = complete, 'user_canceled' = interrupted (flagged); other values left unannotated
    content: [{ type: 'text' | 'thinking' | 'tool_use' | 'tool_result', text?, ... }],
    files:       [ /* uploaded files, see below */ ],
    attachments: [ /* text-extracted docs, see below */ ]
  }, ...]
}
```

**Content blocks** (`content[]`): we export `type === 'text'` (`block.text`) and content-bearing
`tool_use` blocks; `thinking` / `tool_result` are skipped. A `tool_use` block has `name` +
`input`; the three the renderer keys on:
- `artifacts` → `input.{ command: 'create'|'update'|'rewrite', id, title, type, language,
  content, old_str, new_str, version_uuid }`. `create`/`rewrite` carry full `content`;
  `update` is an `old_str`→`new_str` diff. `collectArtifacts` folds them by `id` into the
  final version; `version_uuid` marks the last edit (where it renders).
- `create_file` → `input.{ path, file_text, description }`.
- `visualize:show_widget` → `input.{ title, widget_code }` (each is one-shot; no id).

**`files[]`** (uploaded files): `{ file_kind: 'image'|'document'|'blob', file_name, uuid,
image → preview_url, document → document_asset.url + page_count, blob → size_bytes (no URL) }`.
**`attachments[]`** (text extractions, e.g. .md/.docx): `{ file_name, file_type, file_size,
extracted_content }` — no URL; the text itself is inlined.

Note the convenience top-level `chat_messages[].text` field is **empty** in this rendering
mode — always read the `content` blocks. `startExport` validates that `chat_messages` is an
array (a clear error if the shape drifts), and non-fatal shape issues (unexpected `sender`,
un-appliable artifact update, unknown skipped tools) emit console warnings.

## Maintenance reality

This is an **internal, undocumented Anthropic endpoint** — no public docs, no stability guarantee. It is, however, a data contract that changes far less often than the DOM did (the old copy-button era was almost entirely "fix for Claude's UI changes" commits). If the export breaks, check whether the response shape above changed — that's the single point of coupling now. The script is **fully DOM-free**: no CSS selectors at all (the title comes from `conversationData.name`; `orgId` from a cookie; `conversationId` from the URL). Adding support for a new tool type is a one-line entry in `renderToolUse`.

## Known scope limits (by design, per README)

Exports every message's answer text plus its **content-bearing special elements** on the current branch: artifacts (reconstructed to their final version, rendered once), created files, and `visualize` widgets (charts/diagrams) as fenced code blocks. **Every other tool call is skipped** — web search, bash, file view/edit, and display widgets (maps, recipes, image/place search); their result URLs are ephemeral (the API flags them `is_expired`). Claude's internal `thinking` blocks are also skipped — **excluded by design, not deferred**: exploratory reasoning and discarded hypotheses pollute RAG retrieval and the document outline, and web search results would bake `is_expired` dead links into a document meant to stay useful offline. Treat requests to add either as out of scope (see issues #11 and #19). (`visualize:show_widget` and `create_file` have no revision model, so a "refined" widget/file is a new block and renders each time; only `artifacts` reconstruct.)

Attachments: `describeAttachments()` renders each attachment above the message text, by what the API offers — `m.files` images → embed (`preview_url`); `m.files` documents → link (`document_asset.url`, `page_count`); `m.files` blobs (audio, no URL) → named; `m.attachments` text extractions (.md/.docx/…) → their `extracted_content` inlined as a **blockquote** (so the attachment's own headings stay quoted, out of the document outline). Each carries a word label — **`Attachment: <name> · <meta>`** (no emoji), consistent with `Artifact:`/`File:`/`Widget:`. Runs for **every** message, so an attachment-only turn is never dropped. Text content is inlined (self-contained/RAG-complete); the raw *binary* bytes are not — a portable ZIP bundling the originals is the deferred/premium step.
