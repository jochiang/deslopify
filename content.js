// De-Slopify Content Script
// Hides LinkedIn posts containing emojis or em dashes

(function() {
  'use strict';

  let isEnabled = true;
  let hiddenCount = 0;

  // Regex to match emojis (comprehensive pattern)
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{1F201}-\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]|[\u{200D}]|[\u{FE0F}]/gu;

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
