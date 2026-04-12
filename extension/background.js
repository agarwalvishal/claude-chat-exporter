chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.url?.includes('claude.ai')) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => alert('Please open a Claude.ai conversation page first.')
    });
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    await new Promise(r => setTimeout(r, 200));

    await chrome.tabs.sendMessage(tab.id, { action: 'run' });
  } catch (error) {
    console.error('Export failed:', error.message);
  }
});
