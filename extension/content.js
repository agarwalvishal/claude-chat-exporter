(function() {
  const SELECTORS = {
    copyButton: 'button[data-testid="action-bar-copy"]',
    conversationTitle: '[data-testid="chat-title-button"] .truncate, button[data-testid="chat-title-button"] div.truncate',
    messageActionsGroup: '[role="group"][aria-label="Message actions"]',
    feedbackButton: 'button[aria-label="Give positive feedback"]'
  };

  const DELAYS = {
    copy: 100
  };

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function formatTimestamp(isoString) {
    if (!isoString) return null;
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

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

  async function fetchConversationData() {
    try {
      const conversationId = window.location.pathname.split('/').pop();
      const orgId = document.cookie.match(/lastActiveOrg=([^;]+)/)?.[1];

      if (!conversationId || !orgId) return null;

      const url = `/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`;

      const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

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

  function extractMessagesFromAPI(data) {
    const humanMessages = [];
    const capturedResponses = [];

    if (!data?.chat_messages) return { humanMessages, capturedResponses };

    for (const msg of data.chat_messages) {
      if (msg.sender === 'human') {
        const text = msg.content?.map(c => c.text ?? '').join('').trim();
        if (text) humanMessages.push({ type: 'user', content: text });
      } else if (msg.sender === 'assistant') {
        const text = msg.content?.map(c => c.text ?? '').join('').trim();
        if (text) capturedResponses.push({ type: 'claude', content: text });
      }
    }

    return { humanMessages, capturedResponses };
  }

  function getConversationTitle(conversationData) {
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

  async function triggerCopyButtons(buttons, onProgress) {
    for (let i = 0; i < buttons.length; i++) {
      try {
        if (buttons[i].offsetParent !== null) {
          buttons[i].scrollIntoView({ behavior: 'instant', block: 'nearest' });
          buttons[i].click();
        }
      } catch (error) {
        console.warn(`Failed to click button ${i + 1}:`, error);
      }

      if (onProgress) onProgress(i + 1, buttons.length);

      if (i < buttons.length - 1) {
        await delay(DELAYS.copy);
      }
    }
  }

  function buildMarkdown(humanMessages, capturedResponses, timestamps) {
    let markdown = "# Conversation with Claude\n\n";
    const maxLength = Math.max(humanMessages.length, capturedResponses.length);

    for (let i = 0; i < maxLength; i++) {
      if (i < humanMessages.length && humanMessages[i].content) {
        const ts = timestamps?.get(humanMessages[i].content?.trim());
        const header = ts ? `## Human (${ts}):` : `## Human:`;
        markdown += `${header}\n\n${humanMessages[i].content}\n\n---\n\n`;
      }
      if (i < capturedResponses.length) {
        markdown += `## Claude:\n\n${capturedResponses[i].content}\n\n---\n\n`;
      }
    }

    return markdown;
  }

  async function waitForClipboardOperations(targetArray, expectedCount) {
    const maxWaitTime = 2000;
    const checkInterval = 100;
    let elapsed = 0;

    while (elapsed < maxWaitTime) {
      if (targetArray.length >= expectedCount) return;
      await delay(checkInterval);
      elapsed += checkInterval;
    }
  }

  function createStatusUI(message, progress) {
    const existing = document.getElementById('claude-exporter-status');
    if (existing) existing.remove();

    const statusDiv = document.createElement('div');
    statusDiv.id = 'claude-exporter-status';
    statusDiv.style.cssText = `
      position: fixed; top: 10px; right: 10px; z-index: 999999;
      background: #2196F3; color: white; padding: 12px 16px;
      border-radius: 8px; font-family: system-ui, sans-serif; font-size: 13px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3); max-width: 320px;
    `;

    statusDiv.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">Claude Chat Exporter</div>
      <div id="claude-exporter-message">${message}</div>
      ${progress !== undefined ? `<div id="claude-exporter-progress" style="margin-top: 8px; font-size: 11px; opacity: 0.9;">${progress}</div>` : ''}
    `;

    document.body.appendChild(statusDiv);
    return statusDiv;
  }

  function updateStatusUI(message, progress) {
    const statusDiv = document.getElementById('claude-exporter-status');
    if (!statusDiv) return;

    const msgEl = document.getElementById('claude-exporter-message');
    const progEl = document.getElementById('claude-exporter-progress');

    if (msgEl) msgEl.textContent = message;
    if (progEl && progress !== undefined) progEl.textContent = progress;
  }

  function showSuccessUI(filename) {
    const statusDiv = document.getElementById('claude-exporter-status');
    if (statusDiv) {
      statusDiv.style.background = '#4CAF50';
      statusDiv.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">Export Complete!</div>
        <div>Saved: ${filename}</div>
      `;
    }
  }

  function showErrorUI(message) {
    const statusDiv = document.getElementById('claude-exporter-status');
    if (statusDiv) {
      statusDiv.style.background = '#f44336';
      statusDiv.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">Export Failed</div>
        <div>${message}</div>
      `;
    }
  }

  async function exportConversation() {
    const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
    const capturedResponses = [];
    const humanMessages = [];
    let currentCapture = capturedResponses;
    let interceptorActive = true;

    navigator.clipboard.writeText = function(text) {
      if (interceptorActive && text) {
        currentCapture.push({ type: currentCapture === humanMessages ? 'user' : 'claude', content: text });
      }
    };

    try {
      createStatusUI('Fetching conversation data...');

      const conversationData = await fetchConversationData();
      const timestamps = getMessageTimestamps(conversationData);

      const humanButtons = getCopyButtons(false);
      const claudeButtons = getCopyButtons(true);

      if (humanButtons.length === 0 && claudeButtons.length === 0) {
        const apiMessages = extractMessagesFromAPI(conversationData);
        if (apiMessages.humanMessages.length > 0 || apiMessages.capturedResponses.length > 0) {
          const markdown = buildMarkdown(apiMessages.humanMessages, apiMessages.capturedResponses, timestamps);
          const filename = `${getConversationTitle(conversationData)}.md`;
          downloadMarkdown(markdown, filename);
          showSuccessUI(filename);
          return;
        }
        throw new Error('No messages found. Make sure you are on a Claude conversation page.');
      }

      updateStatusUI('Copying human messages...');
      currentCapture = humanMessages;
      await triggerCopyButtons(humanButtons, (current, total) => {
        updateStatusUI(`Copying human messages...`, `Human: ${current}/${total}`);
      });
      await waitForClipboardOperations(humanMessages, humanButtons.length);

      updateStatusUI('Copying Claude responses...');
      currentCapture = capturedResponses;
      await triggerCopyButtons(claudeButtons, (current, total) => {
        updateStatusUI(`Copying Claude responses...`, `Claude: ${current}/${total}`);
      });
      await waitForClipboardOperations(capturedResponses, claudeButtons.length);

      interceptorActive = false;

      if (humanMessages.length === 0 && capturedResponses.length === 0) {
        const apiMessages = extractMessagesFromAPI(conversationData);
        if (apiMessages.humanMessages.length > 0 || apiMessages.capturedResponses.length > 0) {
          const markdown = buildMarkdown(apiMessages.humanMessages, apiMessages.capturedResponses, timestamps);
          const filename = `${getConversationTitle(conversationData)}.md`;
          downloadMarkdown(markdown, filename);
          showSuccessUI(filename);
          return;
        }
        throw new Error('No messages captured. Try scrolling through the conversation first.');
      }

      const markdown = buildMarkdown(humanMessages, capturedResponses, timestamps);
      const filename = `${getConversationTitle(conversationData)}.md`;
      downloadMarkdown(markdown, filename);

      showSuccessUI(filename);

    } catch (error) {
      showErrorUI(error.message);
    } finally {
      interceptorActive = false;
      navigator.clipboard.writeText = originalWriteText;
    }
  }

  if (typeof window !== 'undefined') {
    window.claudeExporterExport = exportConversation;
  }

  chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
    if (request.action === 'run') {
      exportConversation().catch(e => console.error('[Claude Exporter] Export failed:', e.message));
    }
    return true;
  });
})();
