# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file browser-console script (`claude-chat-exporter.js`) that exports a claude.ai conversation to a markdown file. It runs by pasting the whole file into the browser devtools console while a conversation is open (a one-click bookmarklet in `docs/index.html` wraps the same script). There is **no build system, package manager, test suite, or lint config** — the whole repo is five files: the script, `README.md`, `docs/index.html`, this file, and `LICENSE`.

To test a change: `node --check claude-chat-exporter.js` for syntax, then paste the edited script into the console on a real claude.ai conversation and observe the on-page status indicator and downloaded `.md` file.

**`main` is the release channel.** No tags, no releases, no build artifact: the install page fetches `claude-chat-exporter.js` straight from `main`, and the update check compares against `main`. GitHub Pages serves `docs/` from `main`. **Merging to `main` is publishing** — every script change immediately becomes what new installs get and flips existing bookmarklets to "update available". The script's *hash* is the version signal; there is no version number anywhere.

## Core design decision

The script **reads nothing from Claude's rendered page**. It takes the conversation directly from claude.ai's own **internal API**, whose response already contains each message's **source markdown** (tables, math, code, etc.) — so fidelity is byte-perfect with zero conversion logic. Any proposed change that reintroduces DOM scraping, clipboard/copy-button capture, or HTML→markdown parsing works against the entire point of the project — reject that direction.

Be precise about this rather than saying "DOM-free", which has caused repeated confusion: the script *does* touch the DOM, it just never **reads Claude's markup**. It calls `document.createElement` for the temporary download link and its own status box, and reads `document.cookie` (`lastActiveOrg`) and `window.location` (conversation id, frontmatter `source`). What it contains is **zero CSS selectors** — no `querySelector`, no `aria-label` matching, no class names. That distinction is what makes the previously-reported class of failure structurally impossible now: when Claude localised its `aria-label` text, the old selectors matched nothing and the exporter reported finding no messages.

(Historical note: earlier versions clicked Claude's "copy" buttons and intercepted the clipboard. That was replaced because it only saw the DOM's *virtualized* window — long conversations exported partially and out of order — and coupled the script to constantly-changing CSS selectors. The API returns the same markdown, complete and ordered, and is far more stable. See git history.)

## How the export works

The whole flow lives in `setupClaudeExporter()` (one closure, invoked at the bottom) and is a straight pipeline — one fetch, transform, download:

1. **`fetchConversationData()`** — same-origin GET to the internal endpoint
   `/api/organizations/{orgId}/chat_conversations/{conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`,
   authenticated by the user's existing session cookie. `conversationId` comes from the URL path; `orgId` from the `lastActiveOrg` cookie.

2. **`getOrderedMessages(data)`** — turns the response into an ordered `[{ sender, text, created_at, truncated, stop_reason }]`:
   - **Ordering** follows the *current branch*: walk from `data.current_leaf_message_uuid` up the `parent_message_uuid` chain and reverse (so a regenerated response exports the path actually on screen). Falls back to sorting `chat_messages` by `index`.
   - **Content**: each message's `content` is an array of typed blocks (`text`, `thinking`, `tool_use`, `tool_result`). Walk them **in order** — emit `text` blocks and `tool_use` blocks (via `renderToolUse`), skip `thinking`/`tool_result` — so text and special elements stay interleaved. Messages that end up empty are dropped (the API also returns hidden/system messages the UI never shows). `renderToolUse` renders only the three content-bearing tools (`artifacts`→`content`, `create_file`→`file_text`, `visualize:show_widget`→`widget_code`) as titled fenced code blocks with an API-derived kind label (`Artifact:` / `File:` / `Widget:`, no emoji); **every other tool** (web search, bash, file view/edit, display widgets, unknown) is skipped (their names are logged once at `console.debug` — hidden from users, but a maintainer can enable "Verbose" to spot a new content tool to add). Artifacts are special — `collectArtifacts` folds each `id` through `create` / `update` (an `old_str`→`new_str` diff) / `rewrite` into its final content, and it's rendered **once, at its last edit** (matched by `version_uuid`).

3. **`buildMarkdown(messages)`** — emits YAML frontmatter (`title`, `source`, `model`, `exported`) then one `# Human — <timestamp>` / `# Claude — <timestamp>` header per turn (H1 so Claude's own `##`/`###` content nests beneath it — keeps the outline correct for RAG chunking and Obsidian). No separate title heading or `---` rules. Appends an inline word-based notice to **incomplete** messages via `incompleteNote()` — `truncated` → **Truncated**, `stop_reason: 'user_canceled'` → **Interrupted** (everything else, including a length-limited response, is left unannotated rather than guessing at an unobserved `stop_reason` value). Returns `{ markdown, interrupted, truncated }` — **counts, not a boolean**, because the two mean different things to the reader and only one of them is a problem:

| Signal | Meaning | Status box |
|---|---|---|
| `stop_reason: 'user_canceled'` | The user stopped the response; there is no further content | ✅ green — the export is complete and faithful |
| `truncated` | The API set a flag whose trigger we have never observed | ⚠️ orange, on precaution |
| `warnings[]` | Something didn't reconstruct cleanly (see the four `warn()` sites) | ⚠️ orange |

`startExport` therefore computes `clean = warnings.length === 0 && truncated === 0`. **Do not fold `interrupted` back into that** — treating a response the user deliberately stopped as a warning tells people a perfectly good export went wrong, which is the bug this replaced. Wording stays observational (*"N messages flagged truncated"*) since the meaning is unconfirmed. The exported document is **emoji-free**; emojis appear only in the transient status box / console. Tuned for RAG/Obsidian ingestion.

4. **Title + download** — `getConversationTitle()` uses `conversationData.name` (falls back to `'claude_conversation'`, including when sanitising leaves an empty string), then `downloadMarkdown()` writes the `.md` file.

### Two things that look like noise and are not — do not "simplify" them

- **`collectArtifacts` passes a *function* to `.replace()`**: `a.content.replace(input.old_str, () => input.new_str)`. A plain string replacement would interpret `$&`, `` $` ``, `$'` and `$$` inside `new_str` as replacement patterns and silently corrupt the artifact — sequences that occur in ordinary JS, shell and CSS. The arrow function is load-bearing.
- **`formatTimestamp` pins `'en-US'` but deliberately leaves `timeZone` unset.** Every user gets English month names (deterministic output, good for RAG and for diffing exports), while times render in the reader's own zone so they match what the UI showed. Consequence: the same conversation exported from two countries produces different timestamps, so **any golden-output test must pin `TZ`** (e.g. `TZ=UTC`).

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
    truncated,                   // bool. VERIFIED to exist (probed uncoerced 2026-07-27; the
                                 // key came back present as `false` on every message, and an
                                 // absent field would have been dropped from the JSON). Never
                                 // observed `true`, so its trigger and meaning are UNKNOWN —
                                 // the name suggests content truncation but nothing confirms
                                 // it. Flagged inline + ⚠️ on precaution, worded as an
                                 // observation, never as a claim that content is missing.
    stop_reason,                 // assistant only. 'user_canceled' = interrupted — VERIFIED
                                 // against a real stopped response. 'end_turn'/'stop_sequence'
                                 // as the "complete" values are ASSUMED, not observed. Other
                                 // values left unannotated rather than guessed at.
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

## The install page & bookmarklet (`docs/index.html`)

Two separate programs live in this one file, and conflating them causes real mistakes:

1. **The install-page script** (bottom of the file) runs on `agarwalvishal.github.io`. It manipulates its *own* DOM — the drag button, hint text, copy button, star chip. `bm.removeAttribute("aria-disabled")` re-enables the drag link once the `href` exists. None of this ever runs on claude.ai.
2. **The bookmarklet payload** = a small update-check *shim* + the core script, and only this runs on claude.ai.

Facts that are easy to get wrong:

- **The core script is embedded verbatim at install time.** `fetch(RAW)` runs on the *install page*; the result is baked into the `javascript:` URL. The bookmarklet never fetches code at runtime, so **merging to `main` does not change an already-installed bookmarklet.**
- **Updates are detected by hash, not version.** The page hashes the script it embedded and bakes that in as `B`; on each run the shim re-fetches, re-hashes, and shows a notice if they differ. Nothing anywhere carries a version number.
- **djb2 is implemented twice** — once page-side, once inside the shim string. They must stay identical: if they drift, every bookmarklet computes a hash that can never match its baked one, producing a permanent "update available" for every user, silently.
- **Both fetches use `cache: "no-cache"`.** `raw.githubusercontent.com` sends `max-age=300`, and the shim's own fetch refreshes that cache on every export — so without revalidation the install page would rebuild bookmarklets from a stale script (embedding old code *and* its matching hash, which then never warns).
- **There is no push path for shim changes.** The shim is baked in at install time, so a fix to it reaches a user only when they re-grab. Plan shim changes accordingly, and bypass the browser cache (DevTools → *Disable cache*) for the first re-grab after one.
- **The update check only runs when the user exports.** Notification latency is therefore "their next export", which dwarfs the ≤5-minute cache bound. Corollary: verifying a notice within 5 minutes of a merge is unreliable by construction — wait out `max-age`, or force revalidation.
- **CSP cannot be tested in CI.** Whether the shim's fetch survives claude.ai's `connect-src` needs a real browser on a real page with a live session. Re-check manually whenever `docs/index.html` changes.

## Maintenance reality

This is an **internal, undocumented Anthropic endpoint** — no public docs, no stability guarantee. It is, however, a data contract that changes far less often than the DOM did (the old copy-button era was almost entirely "fix for Claude's UI changes" commits). If the export breaks, check whether the response shape above changed — that's the single point of coupling now. The script contains **zero CSS selectors** (the title comes from `conversationData.name`; `orgId` from a cookie; `conversationId` from the URL), so Claude's markup and its localisation can't break it. Adding support for a new tool type is a one-line entry in `renderToolUse`.

## Known scope limits (by design, per README)

Exports every message's answer text plus its **content-bearing special elements** on the current branch: artifacts (reconstructed to their final version, rendered once), created files, and `visualize` widgets (charts/diagrams) as fenced code blocks. **Every other tool call is skipped** — web search, bash, file view/edit, and display widgets (maps, recipes, image/place search); their result URLs are ephemeral (the API flags them `is_expired`). Claude's internal `thinking` blocks are also skipped — **excluded by design, not deferred**: exploratory reasoning and discarded hypotheses pollute RAG retrieval and the document outline, and web search results would bake `is_expired` dead links into a document meant to stay useful offline. Treat requests to add either as out of scope — both have been raised before and declined. (`visualize:show_widget` and `create_file` have no revision model, so a "refined" widget/file is a new block and renders each time; only `artifacts` reconstruct.)

Attachments: `describeAttachments()` renders each attachment above the message text, by what the API offers — `m.files` images → embed (`preview_url`); `m.files` documents → link (`document_asset.url`, `page_count`); `m.files` blobs (audio, no URL) → named; `m.attachments` text extractions (.md/.docx/…) → their `extracted_content` inlined as a **blockquote** (so the attachment's own headings stay quoted, out of the document outline). Each carries a word label — **`Attachment: <name> · <meta>`** (no emoji), consistent with `Artifact:`/`File:`/`Widget:`. Runs for **every** message, so an attachment-only turn is never dropped. Text content is inlined (self-contained/RAG-complete); the raw *binary* bytes are not — a portable ZIP bundling the originals is deferred work.

## Keeping this file accurate

This file has drifted from the code before, and each time the cost was a wrong decision made
later from a confident-sounding but stale description. When you change something on the left,
revisit what's on the right **in the same PR**:

| If you change… | Revisit |
|---|---|
| the status box, `incompleteNote`, or `buildMarkdown`'s return | the status-indicator list in `README.md`; the severity table above |
| `renderToolUse`, or add a tool | "Known scope limits"; the `tool_use` shapes in the API contract |
| a field read from the API | the response contract — and mark it **verified** vs **assumed** |
| anything in `docs/index.html` | the install-page section; re-verify the shim in a real browser (CSP can't be tested in CI) |
| `claude-chat-exporter.js` at all | nothing to edit, but know that the hash changes → every installed bookmarklet shows "update available". There is no quiet script change. |

**Write what was observed, not what sounds right.** Two claims in this file turned out to be
invented: `truncated` was described as "rare source-data content truncation" when only its
existence had ever been checked, and the copy-button era was described as re-serialising HTML
when it never did. If a field's behaviour hasn't been seen, say so — an honest "unverified" is
more useful to the next reader than a plausible guess.

**Describe the evidence; don't cite an issue number.** Saying a failure was *reported* is what
gives a constraint its weight, but a bare issue reference is the wrong way to say it: GitHub
resolves those in rendered markdown against **whichever repo the reader is viewing**, so in any
of this project's many forks they point at unrelated issues or at nothing. Write what happened
instead — it survives forking, reads correctly offline, and carries more than a number ever
did. Issue references belong in commit messages and pull request descriptions, where the
cross-reference GitHub creates from them is deliberate rather than accidental.
