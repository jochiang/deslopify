// De-Slopify Content Script
// Hides LinkedIn posts containing emojis or em dashes

(function() {
  'use strict';

  let isEnabled = true;
  let hiddenCount = 0;
  
  // Rate limiting settings
  const RATE_LIMIT = {
    maxPostsPerBatch: 10,        // Max posts to process at once
    batchCooldown: 1000,         // ms between batches
    observerDebounce: 500,       // ms to wait after DOM changes
    minTimeBetweenRuns: 2000,    // Minimum ms between full processing runs
  };
  
  let lastProcessTime = 0;
  let isProcessing = false;
  let pendingProcess = false;

  // Regex to match emojis (comprehensive pattern covering all Unicode emoji ranges)
  const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;

  // Em dash character
  const emDashRegex = /\u2014/g;

  // Check if text contains slop indicators
  function containsSlop(text) {
    if (!text) return false;
    // Reset regex lastIndex to avoid state issues with global flag
    emojiRegex.lastIndex = 0;
    emDashRegex.lastIndex = 0;
    return emojiRegex.test(text) || emDashRegex.test(text);
  }

  // Get the post text content
  function getPostText(postElement) {
    // LinkedIn post content selectors - try specific ones first
    const contentSelectors = [
      '.feed-shared-update-v2__description',
      '.feed-shared-text',
      '.feed-shared-inline-show-more-text',
      '.update-components-text',
      '[data-ad-preview="message"]',
      '.break-words',
      '.feed-shared-update-v2__commentary',
      '.feed-shared-text-view',
      '[dir="ltr"]',
      'span[aria-hidden="true"]'
    ];

    let text = '';
    for (const selector of contentSelectors) {
      const elements = postElement.querySelectorAll(selector);
      elements.forEach(el => {
        text += ' ' + el.textContent;
      });
    }
    
    // Fallback: if no text found via selectors, use the whole post's text
    if (!text.trim()) {
      text = postElement.textContent || '';
    }
    
    return text;
  }

  // Check if element is in viewport (with buffer)
  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    const buffer = 500; // pixels above/below viewport to include
    return (
      rect.bottom >= -buffer &&
      rect.top <= (window.innerHeight || document.documentElement.clientHeight) + buffer
    );
  }

  // Process a single post
  function processPost(postElement) {
    if (!isEnabled) return false;
    if (postElement.dataset.deslopified) return false;

    const text = getPostText(postElement);
    
    if (containsSlop(text)) {
      postElement.classList.add('deslopify-hidden');
      postElement.dataset.deslopified = 'hidden';
      hiddenCount++;
      return true;
    } else {
      postElement.dataset.deslopified = 'clean';
      return false;
    }
  }

  // Find and process posts with rate limiting
  function processAllPosts() {
    const now = Date.now();
    
    // Rate limit: don't run too frequently
    if (now - lastProcessTime < RATE_LIMIT.minTimeBetweenRuns) {
      if (!pendingProcess) {
        pendingProcess = true;
        setTimeout(() => {
          pendingProcess = false;
          processAllPosts();
        }, RATE_LIMIT.minTimeBetweenRuns);
      }
      return;
    }
    
    if (isProcessing) {
      pendingProcess = true;
      return;
    }
    
    isProcessing = true;
    lastProcessTime = now;

    const postSelectors = [
      '.feed-shared-update-v2',
      '.occludable-update'
    ];

    // Collect unprocessed posts
    let unprocessedPosts = [];
    
    postSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(post => {
        if (!post.dataset.deslopified && isInViewport(post)) {
          // Make sure we're getting top-level posts
          if (post.closest('.feed-shared-update-v2') === post || 
              post.matches('.occludable-update')) {
            unprocessedPosts.push(post);
          }
        }
      });
    });

    // Process only a limited batch
    const batch = unprocessedPosts.slice(0, RATE_LIMIT.maxPostsPerBatch);
    let hiddenInBatch = 0;
    
    batch.forEach(post => {
      if (processPost(post)) {
        hiddenInBatch++;
      }
    });
    
    if (hiddenInBatch > 0) {
      updateBadge();
    }
    
    isProcessing = false;
    
    // If there are more posts to process, schedule next batch
    if (unprocessedPosts.length > RATE_LIMIT.maxPostsPerBatch) {
      setTimeout(processAllPosts, RATE_LIMIT.batchCooldown);
    }
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

  // Set up mutation observer with rate limiting
  function setupObserver() {
    let observerTimeout = null;
    
    const observer = new MutationObserver((mutations) => {
      // Only care about added nodes that might be posts
      let relevantChange = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) { // Element node
              relevantChange = true;
              break;
            }
          }
        }
        if (relevantChange) break;
      }
      
      if (relevantChange) {
        // Debounce with longer delay
        clearTimeout(observerTimeout);
        observerTimeout = setTimeout(processAllPosts, RATE_LIMIT.observerDebounce);
      }
    });

    // Only observe the main feed container if possible
    const feedContainer = document.querySelector('.scaffold-finite-scroll__content') || 
                          document.querySelector('main') || 
                          document.body;
    
    observer.observe(feedContainer, {
      childList: true,
      subtree: true
    });
  }
  
  // Handle scroll events to process newly visible posts
  function setupScrollHandler() {
    let scrollTimeout = null;
    
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(processAllPosts, 300);
    }, { passive: true });
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
      setupScrollHandler();
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