// De-Slopify Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle');
  const countDisplay = document.getElementById('count');

  // Load saved state
  chrome.storage.sync.get(['enabled'], (result) => {
    toggle.checked = result.enabled !== false; // Default to true
  });

  // Get current count from content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.url?.includes('linkedin.com')) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getCount' }, (response) => {
        if (response?.count !== undefined) {
          countDisplay.textContent = response.count;
        }
      });
    }
  });

  // Handle toggle change
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    
    // Save state
    chrome.storage.sync.set({ enabled });

    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url?.includes('linkedin.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle', enabled });
      }
    });
  });
});
