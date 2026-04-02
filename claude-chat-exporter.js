function setupClaudeExporter() {
  let conversationData = null;
  let statusDiv = null;
  let exportButton = null;
  let isExporting = false;

  const SELECTORS = {
    copyButton: 'button[data-testid="action-bar-copy"]',
    conversationTitle: '[data-testid="chat-title-button"] .truncate, button[data-testid="chat-title-button"] div.truncate',
    messageActionsGroup: '[role="group"][aria-label="Message actions"]',
    feedbackButton: 'button[aria-label="Give positive feedback"]',
    controlsContainer: 'div[data-testid="wiggle-controls-actions"]'
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

  function formatTimestamp(isoString) {
    if (!isoString) return null;
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  async function fetchConversationData() {
    try {
      const conversationId = window.location.pathname.split('/').filter(Boolean).pop();
      const orgId = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/)?.[1];

      if (!conversationId || !orgId) {
        console.warn('Could not get conversation/org ID');
        return null;
      }

      const url = `/api/organizations/${decodeURIComponent(orgId)}/chat_conversations/${conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`;

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

  function sanitizeFilename(title) {
    return title
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .substring(0, 100);
  }

  function getConversationTitle() {
    if (conversationData?.name) {
      const title = conversationData.name.trim();
      if (title && title !== 'New conversation') {
        return sanitizeFilename(title);
      }
    }

    const titleElement = document.querySelector(SELECTORS.conversationTitle);
    const title = titleElement?.textContent?.trim();

    if (!title || title === 'Claude' || title.includes('New conversation')) {
      return 'claude_conversation';
    }

    return sanitizeFilename(title);
  }

  function ensureStatusDiv() {
    if (statusDiv && document.body.contains(statusDiv)) return statusDiv;

    statusDiv = document.createElement('div');
    statusDiv.style.cssText = `
      position: fixed; top: 10px; right: 10px; z-index: 10000;
      background: #2196F3; color: white; padding: 10px 15px;
      border-radius: 5px; font-family: monospace; font-size: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3); max-width: 300px;
    `;
    document.body.appendChild(statusDiv);

    return statusDiv;
  }

  function showStatus(message, background = '#2196F3') {
    const element = ensureStatusDiv();
    element.textContent = message;
    element.style.background = background;
  }

  function cleanupStatus() {
    setTimeout(() => {
      if (statusDiv && document.body.contains(statusDiv)) {
        document.body.removeChild(statusDiv);
      }
      statusDiv = null;
    }, 3000);
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

  async function captureButtons(buttons, targetArray) {
    const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
    let interceptorActive = true;

    navigator.clipboard.writeText = function(text) {
      if (interceptorActive && text) {
        targetArray.push({ content: text });
      }

      return originalWriteText(text);
    };

    try {
      for (let i = 0; i < buttons.length; i++) {
        try {
          if (buttons[i].offsetParent !== null) {
            buttons[i].scrollIntoView({ behavior: 'instant', block: 'nearest' });
            buttons[i].click();
            console.log(`Clicked copy button ${i + 1}/${buttons.length}`);
          }
        } catch (error) {
          console.warn(`Failed to click button ${i + 1}:`, error);
        }

        if (i < buttons.length - 1) {
          await delay(DELAYS.copy);
        }
      }

      const maxWaitTime = 2000;
      const checkInterval = 100;
      let elapsed = 0;

      while (elapsed < maxWaitTime) {
        if (targetArray.length >= buttons.length) {
          return;
        }

        await delay(checkInterval);
        elapsed += checkInterval;
      }

      console.warn(`Timeout: Only captured ${targetArray.length}/${buttons.length} responses`);
    } finally {
      interceptorActive = false;
      navigator.clipboard.writeText = originalWriteText;
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
      if (i < capturedResponses.length && capturedResponses[i].content) {
        markdown += `## Claude:\n\n${capturedResponses[i].content}\n\n---\n\n`;
      }
    }

    return markdown;
  }

  function setButtonState() {
    if (!exportButton) return;

    exportButton.disabled = isExporting;
    exportButton.textContent = isExporting ? 'Exporting...' : 'Export';
  }

  async function startExport() {
    if (isExporting) return;

    isExporting = true;
    setButtonState();

    try {
      const humanMessages = [];
      const capturedResponses = [];

      showStatus('Fetching conversation data...');
      conversationData = await fetchConversationData();
      const timestamps = getMessageTimestamps(conversationData);

      const humanButtons = getCopyButtons(false);
      const claudeButtons = getCopyButtons(true);

      if (humanButtons.length === 0 && claudeButtons.length === 0) {
        throw new Error('No copy buttons found!');
      }

      showStatus('Copying human messages...');
      await captureButtons(humanButtons, humanMessages);

      showStatus('Copying Claude responses...');
      await captureButtons(claudeButtons, capturedResponses);

      if (humanMessages.length === 0 && capturedResponses.length === 0) {
        throw new Error('No messages captured!');
      }

      const markdown = buildMarkdown(humanMessages, capturedResponses, timestamps);
      const filename = `${getConversationTitle()}.md`;
      downloadMarkdown(markdown, filename);

      showStatus(`Downloaded: ${filename}`, '#4CAF50');
    } catch (error) {
      showStatus(`Error: ${error.message}`, '#f44336');
      console.error('Export failed:', error);
    } finally {
      isExporting = false;
      setButtonState();
      cleanupStatus();
    }
  }

  function createExportButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.claudeExporterButton = 'true';
    button.className = `inline-flex
  items-center
  justify-center
  relative
  isolate
  shrink-0
  can-focus
  select-none
  disabled:pointer-events-none
  disabled:opacity-50
  disabled:shadow-none
  disabled:drop-shadow-none font-base-bold
          border-0.5
          overflow-hidden
          transition
          duration-100
          backface-hidden h-8 rounded-md px-3 min-w-[4rem] whitespace-nowrap !text-xs _fill_1abo4_9 _secondary_1abo4_72`;
    button.textContent = 'Export';
    button.addEventListener('click', startExport);

    return button;
  }

  function insertExportButton() {
    const container = document.querySelector(SELECTORS.controlsContainer);
    if (!container) return;

    const existingButton = container.querySelector('[data-claude-exporter-button="true"]');
    if (existingButton) {
      exportButton = existingButton;
      setButtonState();
      return;
    }

    exportButton = createExportButton();
    container.appendChild(exportButton);
    setButtonState();
  }

  insertExportButton();

  const observer = new MutationObserver(() => {
    insertExportButton();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

setupClaudeExporter();
