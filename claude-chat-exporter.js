function setupClaudeExporter() {
  const originalWriteText = navigator.clipboard.writeText;
  const capturedResponses = [];
  const humanMessages = [];
  let conversationData = null;
  let interceptorActive = true;

  // DOM Selectors - easily modifiable if Claude's UI changes
  const SELECTORS = {
    userMessage: '[data-testid="user-message"]',
    messageGroup: '.group',
    copyButton: 'button[data-testid="action-bar-copy"]',
    editButton: 'button[aria-label="Edit"]',
    editTextarea: 'textarea',
    conversationTitle: '[data-testid="chat-title-button"] .truncate, button[data-testid="chat-title-button"] div.truncate',
    messageActionsGroup: '[role="group"][aria-label="Message actions"]',
    feedbackButton: 'button[aria-label="Give positive feedback"]'
  };

  const DELAYS = {
    hover: 50,    // Time to wait for hover effects
    edit: 150,    // Time for edit interface to load
    copy: 100     // Time between copy operations
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

  // Extract timestamps from API response, organized by sender
  function getMessageTimestamps(data) {
    if (!data?.chat_messages) return { human: [], assistant: [] };

    const timestamps = { human: [], assistant: [] };

    for (const msg of data.chat_messages) {
      const ts = formatTimestamp(msg.created_at);
      if (msg.sender === 'human') {
        timestamps.human.push(ts);
      } else if (msg.sender === 'assistant') {
        timestamps.assistant.push(ts);
      }
    }

    return timestamps;
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

  async function extractMessageContent(messageContainer, messageIndex) {
    try {
      // Trigger hover to reveal edit button
      messageContainer.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await delay(DELAYS.hover);

      // Find the turn container that holds both user message and message actions
      let turnContainer = messageContainer.parentElement;
      let editButton = null;

      // Search up the DOM tree until we find the Edit button in a Message actions group
      while (turnContainer && !editButton) {
        editButton = turnContainer.querySelector(SELECTORS.messageActionsGroup + ' ' + SELECTORS.editButton);
        if (!editButton) {
          turnContainer = turnContainer.parentElement;
        }
      }

      if (editButton) {
        editButton.click();
        await delay(DELAYS.edit);

        // Get content from edit interface
        const editTextarea = document.querySelector(SELECTORS.editTextarea);

        let content = '';
        if (editTextarea) {
          content = editTextarea.value;
        }

        // Close edit mode
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await delay(DELAYS.hover);

        if (content) return content;
      }

      throw new Error(`Edit button not found`);

    } catch (error) {
      console.error(`Failed to extract message ${messageIndex + 1}:`, error);
      return null;
    } finally {
      // Clean up hover state
      messageContainer.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    }
  }

  async function extractAllHumanMessages() {
    const userMessages = document.querySelectorAll(SELECTORS.userMessage);

    console.log(`🔄 Extracting ${userMessages.length} human messages...`);

    for (let i = 0; i < userMessages.length; i++) {
      const content = await extractMessageContent(userMessages[i], i);
      if (content) {
        humanMessages.push({
          type: 'user',
          content: content,
          index: i
        });
        updateStatus();
      }
    }

    console.log(`✅ Extracted ${humanMessages.length} human messages`);
  }

  // Intercept clipboard writes for Claude responses
  navigator.clipboard.writeText = function(text) {
    if (interceptorActive && text && text.length > 20) {
      console.log(`📋 Captured Claude response ${capturedResponses.length + 1}`);
      capturedResponses.push({
        type: 'claude',
        content: text
      });
      updateStatus();
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

  async function triggerClaudeResponseCopy() {
    // Find copy buttons that belong to Claude's responses only
    // Claude's message action bars contain feedback buttons, user's don't
    const actionGroups = document.querySelectorAll(SELECTORS.messageActionsGroup);
    const claudeCopyButtons = [];

    actionGroups.forEach(group => {
      // If this group has feedback buttons, it's Claude's action bar
      if (group.querySelector(SELECTORS.feedbackButton)) {
        const copyBtn = group.querySelector(SELECTORS.copyButton);
        if (copyBtn) {
          claudeCopyButtons.push(copyBtn);
        }
      }
    });

    if (claudeCopyButtons.length === 0) {
      throw new Error('No Claude copy buttons found!');
    }

    console.log(`🚀 Clicking ${claudeCopyButtons.length} Claude copy buttons...`);

    // Click Claude's copy buttons with minimal delays
    for (let i = 0; i < claudeCopyButtons.length; i++) {
      const button = claudeCopyButtons[i];
      try {
        if (button.offsetParent !== null) {
          button.scrollIntoView({ behavior: 'instant', block: 'nearest' });
          button.click();
          console.log(`🖱️ Clicked copy button ${i + 1}/${claudeCopyButtons.length}`);
        }
      } catch (error) {
        console.warn(`Failed to click button ${i + 1}:`, error);
      }

      // Only delay between clicks, not after the last one
      if (i < claudeCopyButtons.length - 1) {
        await delay(DELAYS.copy);
      }
    }
  }

  function buildMarkdown(timestamps) {
    let markdown = "# Conversation with Claude\n\n";
    const maxLength = Math.max(humanMessages.length, capturedResponses.length);

    for (let i = 0; i < maxLength; i++) {
      if (i < humanMessages.length && humanMessages[i].content) {
        const ts = timestamps?.human?.[i];
        const header = ts ? `## Human (${ts}):` : `## Human:`;
        markdown += `${header}\n\n${humanMessages[i].content}\n\n---\n\n`;
      }
      if (i < capturedResponses.length) {
        markdown += `## Claude:\n\n${capturedResponses[i].content}\n\n---\n\n`;
      }
    }

    return markdown;
  }

  async function waitForClipboardOperations(expectedCount) {
    const maxWaitTime = 2000;
    const checkInterval = 100;
    let elapsed = 0;

    while (elapsed < maxWaitTime) {
      if (capturedResponses.length >= expectedCount) {
        console.log(`✅ All ${expectedCount} responses captured in ${elapsed}ms`);
        return;
      }
      await delay(checkInterval);
      elapsed += checkInterval;
    }

    console.warn(`⚠️ Timeout: Only captured ${capturedResponses.length}/${expectedCount} responses`);
  }

  function countClaudeCopyButtons() {
    const actionGroups = document.querySelectorAll(SELECTORS.messageActionsGroup);
    let count = 0;
    actionGroups.forEach(group => {
      if (group.querySelector(SELECTORS.feedbackButton) && group.querySelector(SELECTORS.copyButton)) {
        count++;
      }
    });
    return count;
  }

  async function startExport() {
    try {
      // Fetch conversation data from API (for timestamps)
      statusDiv.textContent = 'Fetching conversation data...';
      conversationData = await fetchConversationData();
      const timestamps = getMessageTimestamps(conversationData);

      if (conversationData) {
        console.log(`📅 Got timestamps for ${timestamps.human.length} human and ${timestamps.assistant.length} assistant messages`);
      }

      // Extract human messages via edit button
      statusDiv.textContent = 'Extracting human messages...';
      await extractAllHumanMessages();

      // Copy Claude responses via clipboard interception
      statusDiv.textContent = 'Copying Claude responses...';
      const expectedClaudeResponses = countClaudeCopyButtons();
      await triggerClaudeResponseCopy();

      // Wait for clipboard operations to complete
      await waitForClipboardOperations(expectedClaudeResponses);

      // Build and download markdown
      completeExport(timestamps);

    } catch (error) {
      statusDiv.textContent = `Error: ${error.message}`;
      statusDiv.style.background = '#f44336';
      console.error('Export failed:', error);
    } finally {
      setTimeout(cleanup, 3000);
    }
  }

  function completeExport(timestamps) {
    interceptorActive = false;

    if (humanMessages.length === 0 && capturedResponses.length === 0) {
      statusDiv.textContent = 'No messages captured!';
      statusDiv.style.background = '#f44336';
      return;
    }

    const markdown = buildMarkdown(timestamps);
    const filename = `${getConversationTitle()}.md`;
    downloadMarkdown(markdown, filename);

    statusDiv.textContent = `✅ Downloaded: ${filename}`;
    statusDiv.style.background = '#4CAF50';

    console.log('🎉 Export complete!');
  }

  function cleanup() {
    navigator.clipboard.writeText = originalWriteText;
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
