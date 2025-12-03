// De-Slopify Content Script
// Hides LinkedIn posts containing emojis or em dashes

(function() {
  'use strict';

  let isEnabled = true;
  let hiddenCount = 0;

  // Regex to match emojis (comprehensive pattern)
  const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
  
  // Em dash character
  const emDashRegex = /\u2014/g;

  // Check if text contains slop indicators
  function containsSlop(text) {
    if (!text) return false;
    return emojiRegex.test(text) || emDashRegex.test(text);
  }

  // Get the post text content
  function getPostText(postElement) {
    // LinkedIn post content selectors
    const contentSelectors = [
      '.feed-shared-update-v2__description',
      '.feed-shared-text',
      '.feed-shared-inline-show-more-text',
      '.update-components-text',
      '[data-ad-preview="message"]',
      '.break-words',
      '.feed-shared-update-v2__commentary'
    ];

    let text = '';
    for (const selector of contentSelectors) {
      const elements = postElement.querySelectorAll(selector);
      elements.forEach(el => {
        text += ' ' + el.textContent;
      });
    }
    return text;
  }

  // Process a single post
  function processPost(postElement) {
    if (!isEnabled) return;
    if (postElement.dataset.deslopified) return;

    const text = getPostText(postElement);
    
    if (containsSlop(text)) {
      postElement.classList.add('deslopify-hidden');
      postElement.dataset.deslopified = 'hidden';
      hiddenCount++;
      updateBadge();
    } else {
      postElement.dataset.deslopified = 'clean';
    }
  }

  // Find and process all posts
  function processAllPosts() {
    const postSelectors = [
      '.feed-shared-update-v2',
      '.occludable-update',
      '[data-urn]'
    ];

    postSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(post => {
        // Make sure we're getting top-level posts
        if (post.closest('.feed-shared-update-v2') === post || 
            post.matches('.occludable-update') ||
            (post.matches('[data-urn]') && post.dataset.urn?.includes('activity'))) {
          processPost(post);
        }
      });
    });
  }

  // Show all hidden posts
  function showAllPosts() {
    document.querySelectorAll('.deslopify-hidden').forEach(post => {
      post.classList.remove('deslopify-hidden');
    });
  }

  // Re-hide posts that were previously hidden
  function rehidePosts() {
    document.querySelectorAll('[data-deslopified="hidden"]').forEach(post => {
      post.classList.add('deslopify-hidden');
    });
  }

  // Update badge count
  function updateBadge() {
    chrome.runtime.sendMessage({ action: 'updateCount', count: hiddenCount });
  }

  // Set up mutation observer to catch new posts as they load
  function setupObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          shouldProcess = true;
        }
      });
      if (shouldProcess) {
        // Debounce processing
        clearTimeout(window.deslopifyTimeout);
        window.deslopifyTimeout = setTimeout(processAllPosts, 200);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Initialize
  function init() {
    // Load saved state
    chrome.storage.sync.get(['enabled'], (result) => {
      isEnabled = result.enabled !== false; // Default to true
      
      if (isEnabled) {
        processAllPosts();
      }
      
      setupObserver();
    });
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
      isEnabled = message.enabled;
      if (isEnabled) {
        rehidePosts();
        processAllPosts();
      } else {
        showAllPosts();
      }
      sendResponse({ success: true });
    } else if (message.action === 'getCount') {
      sendResponse({ count: hiddenCount });
    }
    return true;
  });

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
