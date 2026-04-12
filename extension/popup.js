document.getElementById('exportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('exportBtn');
  const status = document.getElementById('status');

  btn.disabled = true;
  btn.textContent = 'Exporting...';
  status.className = 'status loading';
  status.textContent = 'Focusing page...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes('claude.ai')) {
      throw new Error('Please open a Claude.ai conversation first');
    }

    // Update status
    status.textContent = 'Injecting script...';

    // Inject the content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // Wait a moment for injection
    await new Promise(r => setTimeout(r, 200));

    status.textContent = 'Running export...';

    // Send the export command
    await chrome.tabs.sendMessage(tab.id, { action: 'run' });

    status.className = 'status success';
    status.textContent = 'Export started! Check the page.';
    btn.textContent = 'Done!';

  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message;
    btn.textContent = 'Export Failed';
    btn.disabled = false;
  }

  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = 'Export Conversation';
    status.className = 'status';
  }, 4000);
});
