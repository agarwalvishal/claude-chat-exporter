// Claude Chat Exporter — exports a claude.ai conversation to a markdown file.
//
// Approach: read the conversation straight from claude.ai's own internal API
// (the same endpoint the app uses), which returns every message's *source
// markdown* — tables, math, code, and all — in order, complete, with an explicit
// human/assistant label. There is no DOM scraping, no copy-button clicking, no
// clipboard interception, and no scrolling: a single same-origin fetch (using the
// user's existing session) is transformed into markdown and downloaded.
//
// Why not the DOM? The rendered page is a lossy derivative of this markdown, only
// shows a virtualized window of long conversations, and couples the script to
// CSS selectors that change constantly. The API is a far more stable data
// contract. See CLAUDE.md for the response shape.
function setupClaudeExporter() {
  let conversationData = null;

  // Non-fatal warnings collected during the run — logged to the console and
  // summarised in the status box, so a degraded export never looks fully clean.
  const warnings = [];
  const warn = (msg) => { console.warn(msg); warnings.push(msg); };
  // tool_use names that were skipped (not rendered) — logged once, to help spot a
  // new content-bearing tool the registry should learn about.
  const skippedTools = new Set();

  function downloadMarkdown(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    try {
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      URL.revokeObjectURL(a.href); // revoke even if the click throws (avoids a leak)
    }
  }

  // Format ISO timestamp to a readable format
  function formatTimestamp(isoString) {
    if (!isoString) return null;
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null; // don't leak "Invalid Date" into a header
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  // Fetch the full conversation from Claude's internal API. Same-origin request
  // authenticated by the user's existing session cookie; returns title, ordered
  // messages, per-message timestamps and content blocks. See CLAUDE.md.
  async function fetchConversationData() {
    const conversationId = window.location.pathname.split('/').pop();
    const orgId = document.cookie.match(/lastActiveOrg=([^;]+)/)?.[1];

    // A Claude conversation id is a UUID; anything else (e.g. /new, /projects) means
    // the user isn't on a specific conversation.
    if (!conversationId || conversationId.length < 20 || !conversationId.includes('-')) {
      throw new Error('Open a specific Claude conversation first (the current page has no conversation id).');
    }
    if (!orgId) {
      throw new Error("Couldn't read your Claude session (lastActiveOrg cookie missing) — are you signed in?");
    }

    const url = `/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`;

    let response;
    try {
      response = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      throw new Error(`Couldn't reach the Claude API: ${error.message}`);
    }

    if (!response.ok) {
      const hint = (response.status === 401 || response.status === 403)
        ? ' — your session may have expired; reload and sign in'
        : '';
      throw new Error(`Claude API request failed (HTTP ${response.status})${hint}.`);
    }

    try {
      return await response.json();
    } catch (error) {
      throw new Error(`Couldn't parse the Claude API response: ${error.message}`);
    }
  }

  // Turn the API response into an ordered list of visible turns:
  // [{ sender, text, created_at, truncated, stop_reason }] in conversation order.
  //
  // Ordering: the API returns a message *tree*. We follow the current branch by
  // walking from current_leaf_message_uuid up the parent_message_uuid chain and
  // reversing — this exports exactly the path shown on screen even when a
  // response was regenerated. Falls back to sorting by `index` if the leaf is
  // missing.
  //
  // Content: a message's `content` is an array of typed blocks (text, thinking,
  // tool_use, tool_result). We walk them in order, emitting `text` blocks plus the
  // content-bearing `tool_use` blocks (artifacts / created files / widgets, via
  // renderToolUse) so text and special elements stay interleaved; `thinking` and
  // `tool_result` are skipped. Messages that end up empty are dropped (the API also
  // returns hidden/system messages the UI never shows).
  function getOrderedMessages(data) {
    const all = data?.chat_messages || [];
    if (!all.length) return [];

    const byUuid = new Map(all.map(m => [m.uuid, m]));
    let ordered = null;

    const leaf = data.current_leaf_message_uuid;
    if (leaf && byUuid.has(leaf)) {
      const path = [];
      const seen = new Set();
      let cur = byUuid.get(leaf);
      while (cur && !seen.has(cur.uuid)) {
        seen.add(cur.uuid);
        path.push(cur);
        cur = cur.parent_message_uuid ? byUuid.get(cur.parent_message_uuid) : null;
      }
      if (path.length) ordered = path.reverse();
    }

    if (!ordered) {
      warn('Could not resolve the current branch (current_leaf_message_uuid missing/unresolved) — falling back to index order, which may be inaccurate for branched conversations.');
      ordered = [...all].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    }

    // Reconstruct each artifact's final state up-front so it can be rendered once,
    // at its last edit (see collectArtifacts / renderToolUse).
    const artifacts = collectArtifacts(ordered);

    const messages = [];
    const unexpectedSenders = new Set();
    for (const m of ordered) {
      if (m.sender != null && m.sender !== 'human' && m.sender !== 'assistant') {
        unexpectedSenders.add(m.sender);
      }

      // Walk the content blocks in order so text and special elements (artifacts,
      // created files, charts/widgets) stay interleaved exactly as written. Only
      // `text` blocks and content-bearing `tool_use` blocks produce output;
      // `thinking` and `tool_result` blocks are skipped.
      const parts = [];
      for (const block of (m.content || [])) {
        if (block.type === 'text' && typeof block.text === 'string') {
          parts.push(block.text.trim());
        } else if (block.type === 'tool_use') {
          parts.push(renderToolUse(block, artifacts));
        }
      }

      // Message-level uploads (images/docs the human attached) sit above the text,
      // mirroring the UI; prepend them, then the in-order content parts.
      const attachments = describeAttachments(m);
      const text = [attachments, ...parts].filter(Boolean).join('\n\n').trim();

      if (!text) continue; // genuinely empty (hidden/system) message

      messages.push({
        sender: m.sender,
        text,
        created_at: m.created_at,
        truncated: !!m.truncated,
        stop_reason: m.stop_reason
      });
    }

    if (unexpectedSenders.size) {
      warn(`Unexpected sender value(s): ${[...unexpectedSenders].join(', ')} — labelled as "Claude".`);
    }
    if (skippedTools.size) {
      // Debug level: hidden from normal users (Chrome shows it only in "Verbose"),
      // but lets a maintainer spot a new content-bearing tool the registry should handle.
      console.debug('[claude-chat-exporter] tools skipped (not rendered):', [...skippedTools].join(', '));
    }

    return messages;
  }

  // Human-readable byte size, e.g. "4.7 KB".
  function formatBytes(n) {
    if (n == null || isNaN(n)) return null;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Represent a message's attachments as markdown, placed above its text.
  //
  // The API stores attachments in two places, handled by what each actually offers:
  //   • m.files       — uploaded files. Images carry a preview_url (embedded);
  //                     documents (e.g. PDF) carry document_asset.url (linked);
  //                     blobs (e.g. audio) have no usable URL (named marker).
  //   • m.attachments — text extractions (.md/.docx/.txt/.html/…). No URL, but the
  //                     extracted text itself is present, so it is inlined as a
  //                     blockquote — its own headings stay quoted, keeping them out
  //                     of the document outline. This is what makes an export
  //                     self-contained for reading and for RAG.
  //
  // File URLs are same-origin claude.ai endpoints: they load only while signed in
  // to the same account. Bundling the binary originals is left for later.
  function describeAttachments(m) {
    const toAbsolute = (u) => {
      if (!u || typeof u !== 'string') return null;
      try { return new URL(u, 'https://claude.ai').href; } catch { return null; }
    };
    const meta = (...bits) => bits.filter(Boolean).join(' · ');

    const parts = [];

    for (const file of (m.files || [])) {
      const name = file.file_name || 'file';

      if (file.file_kind === 'image') {
        const url = toAbsolute(file.preview_url || file.preview_asset?.url);
        const label = `**Attachment: ${meta(name, 'image')}**`;
        parts.push(url ? `${label}\n\n![${name}](${url})` : label);
      } else if (file.file_kind === 'document') {
        const url = toAbsolute(file.document_asset?.url);
        const pages = file.document_asset?.page_count;
        const info = meta('document', pages ? `${pages} page${pages === 1 ? '' : 's'}` : null);
        const nameLink = url ? `[${name}](${url})` : name;
        parts.push(`**Attachment: ${meta(nameLink, info)}**`);
      } else {
        // blob or unknown kind — no reliable URL to link to
        parts.push(`**Attachment: ${meta(name, file.file_kind, formatBytes(file.size_bytes))}**`);
      }
    }

    for (const attachment of (m.attachments || [])) {
      const name = attachment.file_name || attachment.name || 'attachment';
      const info = meta(attachment.file_type, formatBytes(attachment.file_size));
      const label = `**Attachment: ${meta(name, info)}**`;
      const content = typeof attachment.extracted_content === 'string'
        ? attachment.extracted_content.trim()
        : '';

      const lines = [label];
      if (content) {
        lines.push('');
        for (const line of content.split('\n')) lines.push(line);
      }
      // Quote the whole block so the attachment's own headings don't enter the outline
      parts.push(lines.map(line => (line ? `> ${line}` : '>')).join('\n'));
    }

    return parts.join('\n\n');
  }

  // Fold every artifact (keyed by `id`) into its final state. The `artifacts` tool is
  // the only element with a revision model: `create`/`rewrite` carry full `content`;
  // `update` carries an `old_str`→`new_str` diff. We apply them in order and remember
  // the `version_uuid` of each artifact's LAST block, so renderToolUse can emit it once,
  // at its final edit. (Widgets and created files have no linking id and are rendered
  // as-is, each occurrence.)
  function collectArtifacts(ordered) {
    const artifacts = new Map();
    for (const m of ordered) {
      for (const block of (m.content || [])) {
        if (block.type !== 'tool_use' || block.name !== 'artifacts') continue;
        const input = block.input || {};
        const id = input.id || '__artifact__';
        let a = artifacts.get(id);
        if (!a) { a = { content: '' }; artifacts.set(id, a); }

        if (input.command === 'update') {
          if (typeof input.old_str === 'string' && typeof input.new_str === 'string') {
            if (a.content.indexOf(input.old_str) === -1) {
              warn(`Artifact "${a.title || id}": an update couldn't be applied (source text not found) — its content may be incomplete.`);
            } else {
              // Function replacer, not a string: a plain string would interpret `$&`,
              // "$`", `$'` and `$$` in new_str as replacement patterns and silently
              // corrupt the artifact (such sequences occur in real code).
              a.content = a.content.replace(input.old_str, () => input.new_str);
            }
          }
        } else if (typeof input.content === 'string') {
          a.content = input.content; // create / rewrite → full content
        }
        if (input.title) a.title = input.title;      // metadata lives on the create block
        if (input.type) a.type = input.type;
        if (input.language) a.language = input.language;
        a.lastVersionUuid = input.version_uuid;      // last write wins → finalization block
      }
    }

    for (const [id, a] of artifacts) {
      if (!a.content) warn(`Artifact "${a.title || id}" ended up empty — it may not have exported.`);
    }
    return artifacts;
  }

  // Render a `tool_use` block. Only the three content-bearing tools produce output —
  // artifacts, created files, and visualize widgets (charts/diagrams) — each as a
  // titled fenced code block with a kind label drawn from the API. Every other tool
  // (web search, bash, file view/edit, display widgets, unknown) is skipped. Artifacts
  // render once, at their final edit; the reconstructed content comes from `artifacts`.
  function renderToolUse(block, artifacts) {
    const input = block.input || {};
    const name = block.name || '';

    // A code fence longer than any backtick run in the source (avoids collisions).
    const fenceFor = (src) => '`'.repeat(Math.max(3, ...(src.match(/`+/g) || []).map(s => s.length + 1)));
    const codeBlock = (label, source, lang) => {
      const fence = fenceFor(source);
      return `**${label}**\n\n${fence}${lang || ''}\n${source}\n${fence}`;
    };

    if (name === 'artifacts') {
      const a = artifacts.get(input.id || '__artifact__');
      // Only the final edit renders; earlier create/update/rewrite blocks emit nothing.
      if (!a || input.version_uuid !== a.lastVersionUuid || !a.content) return '';
      const TYPE = {
        'application/vnd.ant.react': { lang: 'jsx', label: 'React' },
        'text/html': { lang: 'html', label: 'HTML' },
        'image/svg+xml': { lang: 'svg', label: 'SVG' },
        'application/vnd.ant.mermaid': { lang: 'mermaid', label: 'Mermaid' },
        'text/markdown': { lang: 'markdown', label: 'Markdown' },
        'application/vnd.ant.code': { lang: a.language || '', label: a.language || 'Code' }
      };
      const t = TYPE[a.type] || { lang: a.language || '', label: a.language || '' };
      const label = `Artifact: ${a.title || 'untitled'}${t.label ? ` · ${t.label}` : ''}`;
      return codeBlock(label, a.content, t.lang);
    }

    if (name === 'create_file' && typeof input.file_text === 'string' && input.file_text) {
      const file = String(input.path || 'file').split('/').pop();
      const ext = file.includes('.') ? file.split('.').pop().toLowerCase() : '';
      const EXT_LANG = {
        py: 'python', js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
        md: 'markdown', html: 'html', css: 'css', json: 'json', sh: 'bash',
        yml: 'yaml', yaml: 'yaml', sql: 'sql', java: 'java', rb: 'ruby', go: 'go',
        rs: 'rust', c: 'c', cpp: 'cpp', txt: ''
      };
      return codeBlock(`File: ${file}`, input.file_text, EXT_LANG[ext] ?? '');
    }

    if (name === 'visualize:show_widget' && typeof input.widget_code === 'string' && input.widget_code) {
      return codeBlock(`Widget: ${input.title || 'untitled'}`, input.widget_code, 'jsx');
    }

    if (name) skippedTools.add(name); // every other tool is skipped; track for visibility
    return '';
  }

  function sanitizeTitle(title) {
    return title
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .substring(0, 100);
  }

  function getConversationTitle() {
    const title = conversationData?.name?.trim();
    if (title && title !== 'New conversation') {
      // A punctuation-only title (e.g. "***") sanitizes to '' — don't emit ".md".
      return sanitizeTitle(title) || 'claude_conversation';
    }
    return 'claude_conversation';
  }

  // YAML double-quoted scalar (escapes backslashes and quotes).
  function yamlString(value) {
    return '"' + String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  // A word-based notice appended to an incomplete message (or '' when complete). Only the
  // two signals verified in the API are flagged: `truncated` (rare source-data content
  // truncation) and `stop_reason: 'user_canceled'` (the user stopped the response).
  function incompleteNote(message) {
    if (message.truncated) {
      return '> **Truncated:** the message was truncated in the source data and may be incomplete.';
    }
    if (message.stop_reason === 'user_canceled') {
      return '> **Interrupted:** this response was stopped before Claude finished.';
    }
    return '';
  }

  // Output shape (tuned for RAG ingestion and Obsidian):
  //   • YAML frontmatter carries doc-level metadata (title, source, model, date)
  //     — Obsidian reads it as properties; RAG attaches it to every chunk.
  //   • Each turn is an H1 header, so Claude's own ##/### content nests beneath it
  //     and turn boundaries are the top split level. (No separate title heading or
  //     `---` rules — the frontmatter and headers already delimit everything.)
  function buildMarkdown(messages) {
    const title = conversationData?.name?.trim() || 'Claude conversation';
    const source = window.location.origin + window.location.pathname;

    const frontMatter = ['---', `title: ${yamlString(title)}`, `source: ${yamlString(source)}`];
    if (conversationData?.model) frontMatter.push(`model: ${yamlString(conversationData.model)}`);
    frontMatter.push(`exported: ${new Date().toISOString().slice(0, 10)}`, '---', '');

    let markdown = frontMatter.join('\n') + '\n';
    let anyIncomplete = false;

    for (const message of messages) {
      const who = message.sender === 'human' ? 'Human' : 'Claude';
      const ts = formatTimestamp(message.created_at);
      const header = ts ? `# ${who} — ${ts}` : `# ${who}`;

      let body = message.text;
      const note = incompleteNote(message);
      if (note) {
        anyIncomplete = true;
        body += `\n\n${note}`;
      }

      markdown += `${header}\n\n${body}\n\n`;
    }

    return { markdown, anyIncomplete };
  }

  // Status indicator
  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = `
    position: fixed; top: 10px; right: 10px; z-index: 10000;
    background: #2196F3; color: white; padding: 10px 15px;
    border-radius: 5px; font-family: monospace; font-size: 12px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3); max-width: 300px;
  `;
  document.body.appendChild(statusDiv);

  function cleanup() {
    if (document.body.contains(statusDiv)) {
      document.body.removeChild(statusDiv);
    }
  }

  async function startExport() {
    try {
      statusDiv.textContent = 'Fetching conversation…';
      conversationData = await fetchConversationData();

      // Validate the response shape — a missing chat_messages array means the
      // internal API changed, which we surface clearly rather than as "no messages".
      if (!conversationData || typeof conversationData !== 'object' || !Array.isArray(conversationData.chat_messages)) {
        throw new Error('Unexpected API response — chat_messages is missing (the endpoint may have changed).');
      }

      const messages = getOrderedMessages(conversationData);
      if (!messages.length) {
        const hadContent = conversationData.chat_messages.some(m => Array.isArray(m.content) && m.content.length);
        throw new Error(hadContent
          ? 'No exportable content extracted — the message/content shape may have changed.'
          : 'No messages found in this conversation.');
      }

      const { markdown, anyIncomplete } = buildMarkdown(messages);
      const filename = `${getConversationTitle()}.md`;
      downloadMarkdown(markdown, filename);

      const notes = [];
      if (anyIncomplete) notes.push('some responses incomplete');
      if (warnings.length) notes.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'} — see console`);
      const clean = notes.length === 0;
      statusDiv.textContent = `${clean ? '✅' : '⚠️'} Exported ${messages.length} messages${notes.length ? ` (${notes.join('; ')})` : ''}: ${filename}`;
      statusDiv.style.background = clean ? '#4CAF50' : '#ff9800';
      console.log(`🎉 Export complete — ${messages.length} messages → ${filename}`);

    } catch (error) {
      statusDiv.textContent = `Error: ${error.message}`;
      statusDiv.style.background = '#f44336';
      console.error('Export failed:', error);
    } finally {
      setTimeout(cleanup, 4000);
    }
  }

  startExport();
}

// Run the exporter
setupClaudeExporter();
