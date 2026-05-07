function setupClaudeExporter() {
  const originalWriteText = navigator.clipboard.writeText;
  const originalWrite = navigator.clipboard.write;
  const capturedResponses = [];
  const humanMessages = [];
  let conversationData = null;
  let currentCapture = capturedResponses;
  let interceptorActive = true;

  // DOM Selectors - easily modifiable if Claude's UI changes
  const SELECTORS = {
    copyButton: 'button[data-testid="action-bar-copy"]',
    conversationTitle: '[data-testid="chat-title-button"] .truncate, button[data-testid="chat-title-button"] div.truncate',
    messageActionsGroup: '[role="group"][aria-label="Message actions"]',
    feedbackButton: 'button[aria-label="Give positive feedback"]'
  };

  const DELAYS = {
    copy: 100
  };

  function downloadMarkdown(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Format ISO timestamp to readable format
  function formatTimestamp(isoString) {
    if (!isoString) return null;
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  // Fetch conversation data from Claude API to get timestamps
  async function fetchConversationData() {
    try {
      const conversationId = window.location.pathname.split('/').pop();
      const orgId = document.cookie.match(/lastActiveOrg=([^;]+)/)?.[1];

      if (!conversationId || !orgId) {
        console.warn('Could not get conversation/org ID');
        return null;
      }

      const url = `/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`;

      const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        console.warn(`API error: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.warn('Failed to fetch conversation data:', error);
      return null;
    }
  }

  // Build a content → timestamp map for human messages from API response.
  // Matching by content avoids index misalignment caused by hidden/system
  // messages that the API returns but the UI does not display.
  function getMessageTimestamps(data) {
    const map = new Map();
    if (!data?.chat_messages) return map;

    for (const msg of data.chat_messages) {
      if (msg.sender === 'human') {
        const text = msg.content?.map(c => c.text ?? '').join('').trim();
        if (text) map.set(text, formatTimestamp(msg.created_at));
      }
    }

    return map;
  }

  // Build a final-text → thinking-blocks map for assistant messages.
  // Keyed by the joined text-block content so it can be looked up by the
  // clipboard-captured response text (same matching strategy as timestamps).
  function getAssistantThinking(data) {
    const map = new Map();
    if (!data?.chat_messages) return map;

    for (const msg of data.chat_messages) {
      if (msg.sender !== 'assistant' || !Array.isArray(msg.content)) continue;

      const thinking = msg.content
        .filter(c => c.type === 'thinking')
        .map(c => (c.thinking ?? c.text ?? '').trim())
        .filter(Boolean);

      if (thinking.length === 0) continue;

      const finalText = msg.content
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('')
        .trim();

      if (finalText) map.set(finalText, thinking);
    }

    return map;
  }

  function getConversationTitle() {
    // First try to get from API data
    if (conversationData?.name) {
      const title = conversationData.name.trim();
      if (title && title !== 'New conversation') {
        return title
          .replace(/[<>:"/\\|?*]/g, '_')
          .replace(/\s+/g, '_')
          .replace(/_{2,}/g, '_')
          .replace(/^_+|_+$/g, '')
          .toLowerCase()
          .substring(0, 100);
      }
    }

    // Fallback to DOM
    const titleElement = document.querySelector(SELECTORS.conversationTitle);
    const title = titleElement?.textContent?.trim();

    if (!title || title === 'Claude' || title.includes('New conversation')) {
      return 'claude_conversation';
    }

    return title
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .substring(0, 100);
  }

  // Intercept clipboard writes and route to the active capture target.
  // Claude's UI may use either writeText() (plain) or write() (rich
  // ClipboardItem with text/plain + text/html), so both are patched.
  function captureText(text) {
    if (interceptorActive && text) {
      const type = currentCapture === humanMessages ? 'user' : 'claude';
      console.log(`📋 Captured ${type} message ${currentCapture.length + 1}`);
      currentCapture.push({ type, content: text });
      updateStatus();
    }
  }

  navigator.clipboard.writeText = function(text) {
    captureText(text);
  };

  navigator.clipboard.write = async function(items) {
    for (const item of items || []) {
      try {
        if (item.types?.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          captureText(await blob.text());
        }
      } catch (error) {
        console.warn('Failed to read clipboard item:', error);
      }
    }
  };

  // Create status indicator
  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = `
    position: fixed; top: 10px; right: 10px; z-index: 10000;
    background: #2196F3; color: white; padding: 10px 15px;
    border-radius: 5px; font-family: monospace; font-size: 12px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3); max-width: 300px;
  `;
  document.body.appendChild(statusDiv);

  function updateStatus() {
    statusDiv.textContent = `Human: ${humanMessages.length} | Claude: ${capturedResponses.length}`;
  }

  // Returns copy buttons from action bars filtered by message type.
  // claudeOnly=true  → action bars WITH a feedback button (Claude responses)
  // claudeOnly=false → action bars WITHOUT a feedback button (human messages)
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

  async function triggerCopyButtons(buttons) {
    for (let i = 0; i < buttons.length; i++) {
      try {
        if (buttons[i].offsetParent !== null) {
          buttons[i].scrollIntoView({ behavior: 'instant', block: 'nearest' });
          buttons[i].click();
          console.log(`🖱️ Clicked copy button ${i + 1}/${buttons.length}`);
        }
      } catch (error) {
        console.warn(`Failed to click button ${i + 1}:`, error);
      }

      // Only delay between clicks, not after the last one
      if (i < buttons.length - 1) {
        await delay(DELAYS.copy);
      }
    }
  }

  function buildMarkdown(timestamps, thinkingMap) {
    let markdown = "# Conversation with Claude\n\n";
    const maxLength = Math.max(humanMessages.length, capturedResponses.length);

    for (let i = 0; i < maxLength; i++) {
      if (i < humanMessages.length && humanMessages[i].content) {
        const ts = timestamps?.get(humanMessages[i].content?.trim());
        const header = ts ? `## Human (${ts}):` : `## Human:`;
        markdown += `${header}\n\n${humanMessages[i].content}\n\n---\n\n`;
      }
      if (i < capturedResponses.length) {
        const claudeText = capturedResponses[i].content;
        const thinking = thinkingMap?.get(claudeText.trim());
        let body = '';
        if (thinking?.length) {
          for (const t of thinking) {
            body += `<details>\n<summary>Thinking</summary>\n\n${t}\n\n</details>\n\n`;
          }
        }
        body += claudeText;
        markdown += `## Claude:\n\n${body}\n\n---\n\n`;
      }
    }

    return markdown;
  }

  async function waitForClipboardOperations(targetArray, expectedCount) {
    const maxWaitTime = 2000;
    const checkInterval = 100;
    let elapsed = 0;

    while (elapsed < maxWaitTime) {
      if (targetArray.length >= expectedCount) {
        console.log(`✅ All ${expectedCount} responses captured in ${elapsed}ms`);
        return;
      }
      await delay(checkInterval);
      elapsed += checkInterval;
    }

    console.warn(`⚠️ Timeout: Only captured ${targetArray.length}/${expectedCount} responses`);
  }

  async function startExport() {
    try {
      // Fetch conversation data from API (for timestamps, title, and thinking)
      statusDiv.textContent = 'Fetching conversation data...';
      conversationData = await fetchConversationData();
      const timestamps = getMessageTimestamps(conversationData);
      const thinkingMap = getAssistantThinking(conversationData);

      if (conversationData) {
        console.log(`📅 Got timestamps for ${timestamps.size} human messages`);
        console.log(`💭 Got thinking for ${thinkingMap.size} assistant messages`);
      }

      const humanButtons = getCopyButtons(false);
      const claudeButtons = getCopyButtons(true);

      if (humanButtons.length === 0 && claudeButtons.length === 0) {
        throw new Error('No copy buttons found!');
      }

      // Phase 1: Human messages
      statusDiv.textContent = 'Copying human messages...';
      currentCapture = humanMessages;
      await triggerCopyButtons(humanButtons);
      await waitForClipboardOperations(humanMessages, humanButtons.length);

      // Phase 2: Claude responses
      statusDiv.textContent = 'Copying Claude responses...';
      currentCapture = capturedResponses;
      await triggerCopyButtons(claudeButtons);
      await waitForClipboardOperations(capturedResponses, claudeButtons.length);

      completeExport(timestamps, thinkingMap);

    } catch (error) {
      statusDiv.textContent = `Error: ${error.message}`;
      statusDiv.style.background = '#f44336';
      console.error('Export failed:', error);
    } finally {
      setTimeout(cleanup, 3000);
    }
  }

  function completeExport(timestamps, thinkingMap) {
    interceptorActive = false;

    if (humanMessages.length === 0 && capturedResponses.length === 0) {
      statusDiv.textContent = 'No messages captured!';
      statusDiv.style.background = '#f44336';
      return;
    }

    const markdown = buildMarkdown(timestamps, thinkingMap);
    const filename = `${getConversationTitle()}.md`;
    downloadMarkdown(markdown, filename);

    statusDiv.textContent = `✅ Downloaded: ${filename}`;
    statusDiv.style.background = '#4CAF50';

    console.log('🎉 Export complete!');
  }

  function cleanup() {
    navigator.clipboard.writeText = originalWriteText;
    navigator.clipboard.write = originalWrite;
    if (document.body.contains(statusDiv)) {
      document.body.removeChild(statusDiv);
    }
  }

  // Initialize
  updateStatus();
  setTimeout(startExport, 1000);
}

// Run the exporter
setupClaudeExporter();
