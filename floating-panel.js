(function() {
  'use strict';

  const STORAGE_KEY = 'claude-floating-panel-state';
  const DEFAULTS = {
    x: null, // null means auto-position (top-right)
    y: 80,
    width: 420,
    height: 700,
    open: false
  };
  const MIN_WIDTH = 360;
  const MIN_HEIGHT = 400;

  let panelState = { ...DEFAULTS };
  let panelEl = null;
  let shadowRoot = null;
  let container = null;
  let iframe = null;
  let isVisible = false;
  let escapeKeyListener = null;

  function isExtensionValid() {
    try {
      return !!chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  function cleanup() {
    if (panelEl && panelEl.parentNode) {
      panelEl.remove();
    }
    panelEl = null;
    shadowRoot = null;
    container = null;
    iframe = null;
    isVisible = false;
    if (escapeKeyListener) {
      document.removeEventListener('keydown', escapeKeyListener);
      escapeKeyListener = null;
    }
  }

  // Load saved state
  async function loadState() {
    if (!isExtensionValid()) return;
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        panelState = { ...DEFAULTS, ...result[STORAGE_KEY] };
      }
    } catch (e) { /* ignore */ }
  }

  // Save state
  function saveState() {
    if (!isExtensionValid()) return;
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: panelState });
    } catch (e) { /* ignore */ }
  }

  function getStyles() {
    return `
      :host {
        all: initial;
      }

      .claude-panel-container {
        position: fixed;
        z-index: 2147483647;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: #FAF9F5;
        opacity: 0;
        transform: scale(0.95);
        pointer-events: none;
        transition: opacity 0.2s ease-out, transform 0.2s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }

      .claude-panel-container.visible {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
      }

      .claude-panel-header {
        height: 40px;
        background: #F0EEE6;
        display: flex;
        align-items: center;
        padding: 0 8px 0 14px;
        cursor: grab;
        user-select: none;
        flex-shrink: 0;
        border-bottom: 1px solid rgba(31, 30, 29, 0.1);
      }

      .claude-panel-header:active {
        cursor: grabbing;
      }

      .claude-panel-title {
        flex: 1;
        font-size: 13px;
        font-weight: 600;
        color: #141413;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .claude-panel-title svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .claude-panel-btn {
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #141413;
        transition: background 0.15s;
        padding: 0;
      }

      .claude-panel-btn:hover {
        background: rgba(31, 30, 29, 0.08);
      }

      .claude-panel-btn svg {
        width: 16px;
        height: 16px;
      }

      .claude-panel-iframe {
        flex: 1;
        border: none;
        width: 100%;
        background: white;
      }

      .claude-panel-resize {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: nwse-resize;
        z-index: 1;
      }

      .claude-panel-resize::after {
        content: '';
        position: absolute;
        bottom: 4px;
        right: 4px;
        width: 8px;
        height: 8px;
        border-right: 2px solid rgba(31, 30, 29, 0.25);
        border-bottom: 2px solid rgba(31, 30, 29, 0.25);
        border-radius: 0 0 2px 0;
      }

      .claude-panel-resize-edge-right {
        position: absolute;
        top: 40px;
        right: 0;
        bottom: 20px;
        width: 6px;
        cursor: ew-resize;
        z-index: 1;
      }

      .claude-panel-resize-edge-left {
        position: absolute;
        top: 40px;
        left: 0;
        bottom: 20px;
        width: 6px;
        cursor: ew-resize;
        z-index: 1;
      }

      .claude-panel-resize-edge-bottom {
        position: absolute;
        bottom: 0;
        left: 20px;
        right: 20px;
        height: 6px;
        cursor: ns-resize;
        z-index: 1;
      }

      .claude-panel-resize-edge-top {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 6px;
        cursor: ns-resize;
        z-index: 1;
      }
    `;
  }

  function createPanel() {
    // Remove any stale panel from a previous script context
    const existing = document.querySelector('claude-floating-panel');
    if (existing) existing.remove();

    panelEl = document.createElement('claude-floating-panel');
    shadowRoot = panelEl.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = getStyles();
    shadowRoot.appendChild(style);

    container = document.createElement('div');
    container.className = 'claude-panel-container';

    // Header
    const header = document.createElement('div');
    header.className = 'claude-panel-header';

    const title = document.createElement('div');
    title.className = 'claude-panel-title';
    title.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3.13946 10.6399L6.28757 8.87462L6.37405 8.73821L6.28757 8.6339H6.13189L5.60432 8.6018L3.80541 8.55366L2.24865 8.48947L0.735135 8.40923H0.492973L0.354595 8.32899L0.181622 8.1685L0.0345946 8.01605L0 7.85557L0.0345946 7.62287L0.138378 7.44634L0.224865 7.40622H0.354595L0.812973 7.44634L1.82486 7.51856L3.34703 7.62287L4.44541 7.68706L6.08 7.85557H6.33946L6.37405 7.75125L6.28757 7.68706L6.21838 7.62287L4.64432 6.55567L2.94054 5.4323L2.04973 4.78235L1.57405 4.45336L1.33189 4.14845L1.22811 3.92377L1.17622 3.69107L1.22811 3.47442L1.33189 3.28185L1.46162 3.13741L1.66054 2.99298H1.87676L2.24865 3.0331L2.39568 3.07322L2.99243 3.53059L4.26378 4.51755L5.92432 5.73721L6.16649 5.93781H6.27892V5.82548L6.16649 5.64092L5.26703 4.01204L4.30703 2.35105L3.87459 1.66098L3.76216 1.25176C3.7391 1.16082 3.69297 0.977332 3.69297 0.970913V0.762287L3.77946 0.505517L3.93513 0.240722L4.18595 0.0882648L4.4627 0H4.67892L4.83459 0.0240722L5.12865 0.0882648L5.4054 0.328987L5.82054 1.27583L6.48649 2.76028L7.52432 4.78235L7.82703 5.38415L7.99135 5.93781L8.05189 6.10632H8.15567V6.01003L8.24216 4.87061L8.39784 3.47442L8.55351 1.67703L8.6054 1.17151L8.85622 0.561685L8.9773 0.417252L9.21946 0.232698H9.35784L9.74703 0.417252L9.97189 0.665998L10.067 0.874624L10.0238 1.17151L9.83351 2.40722L9.46162 4.34102L9.21946 5.64092H9.35784L9.52216 5.47242L10.1795 4.60582L11.2778 3.22568L11.7622 2.68004L12.333 2.07823L12.6962 1.78937L13.0162 1.67703L13.3881 1.78937L13.7168 2.06219L13.8897 2.54363V2.76028L13.6649 3.32197L12.9557 4.22066L12.3676 4.98295L12.0043 5.56871L11.0011 7.02106V7.08526H11.1741L13.0768 6.67603L14.1059 6.49147L15.3341 6.28285L15.5762 6.34704L15.8876 6.53962L15.9481 6.80441L15.8876 7.12538L15.7319 7.34203L14.4173 7.66299L12.8778 7.97593L10.5854 8.51559C10.5705 8.51909 10.56 8.53236 10.56 8.54764C10.56 8.56468 10.573 8.57891 10.59 8.58044L11.6238 8.67402L12.0649 8.69809H13.1459L15.1611 8.85055L15.6886 9.19559L15.9481 9.39619L16 9.62086L15.9481 9.94985L15.8443 10.1023L15.4119 10.3029L15.1351 10.3591L14.0454 10.1023L11.4941 9.49248L10.6205 9.27583H10.4995V9.34804L11.2259 10.0622L12.5665 11.2658L14.2357 12.8225L14.3222 13.0953V13.2076L14.1059 13.5125L13.9243 13.5206L13.8811 13.4804L12.4108 12.3731L12.2984 12.325L11.84 11.8756L10.56 10.7924H10.4735V10.9047L10.7676 11.338L12.333 13.6891L12.4108 14.4112L12.2984 14.6439L11.8919 14.7884L11.667 14.7563L11.4508 14.7081L11.2605 14.5396L10.5254 13.4162L9.5827 11.9719L8.82162 10.672H8.79342C8.76039 10.672 8.73278 10.6972 8.7297 10.73L8.27676 15.5667L8.06919 15.8154L7.6454 16H7.58486L7.17838 15.6951L6.96216 15.1976L7.17838 14.2106L7.43784 12.9268L7.6454 11.9077L7.83567 10.6399L7.95187 10.2164C7.9548 10.2057 7.95069 10.1944 7.94161 10.1881C7.91157 10.1672 7.87034 10.1741 7.84878 10.2037L6.89297 11.5145L5.44 13.4804L4.28973 14.7081L4.01297 14.8205H3.80541L3.5373 14.5717V14.4514L3.58054 14.1304L3.84865 13.7372L5.44 11.7151L6.4 10.4554L7.01872 9.73222C7.04511 9.70139 7.04245 9.65523 7.0127 9.62763C7.00333 9.61894 6.98925 9.61773 6.97854 9.62471L2.75027 12.3811L1.99784 12.4774L1.66919 12.1725L1.71243 11.675L1.86811 11.5145L3.13946 10.6399Z" fill="#D97757"/>
      </svg>
      Claude
    `;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'claude-panel-btn';
    closeBtn.title = 'Close';
    closeBtn.innerHTML = `
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M15.1464 4.14642C15.3417 3.95121 15.6582 3.95118 15.8534 4.14642C16.0486 4.34168 16.0486 4.65822 15.8534 4.85346L10.7069 9.99997L15.8534 15.1465C16.0486 15.3417 16.0486 15.6583 15.8534 15.8535C15.6826 16.0244 15.4186 16.0461 15.2245 15.918L15.1464 15.8535L9.99989 10.707L4.85338 15.8535C4.65813 16.0486 4.34155 16.0486 4.14634 15.8535C3.95115 15.6583 3.95129 15.3418 4.14634 15.1465L9.29286 9.99997L4.14634 4.85346C3.95129 4.65818 3.95115 4.34162 4.14634 4.14642C4.34154 3.95128 4.65812 3.95138 4.85338 4.14642L9.99989 9.29294L15.1464 4.14642Z"/>
      </svg>
    `;
    closeBtn.addEventListener('click', () => hidePanel());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Iframe
    iframe = document.createElement('iframe');
    iframe.className = 'claude-panel-iframe';
    iframe.allow = 'clipboard-write; clipboard-read';

    // Resize handles
    const resizeCorner = document.createElement('div');
    resizeCorner.className = 'claude-panel-resize';

    const resizeEdgeRight = document.createElement('div');
    resizeEdgeRight.className = 'claude-panel-resize-edge-right';

    const resizeEdgeLeft = document.createElement('div');
    resizeEdgeLeft.className = 'claude-panel-resize-edge-left';

    const resizeEdgeBottom = document.createElement('div');
    resizeEdgeBottom.className = 'claude-panel-resize-edge-bottom';

    const resizeEdgeTop = document.createElement('div');
    resizeEdgeTop.className = 'claude-panel-resize-edge-top';

    container.appendChild(header);
    container.appendChild(iframe);
    container.appendChild(resizeCorner);
    container.appendChild(resizeEdgeRight);
    container.appendChild(resizeEdgeLeft);
    container.appendChild(resizeEdgeBottom);
    container.appendChild(resizeEdgeTop);
    shadowRoot.appendChild(container);

    document.documentElement.prepend(panelEl);

    // Setup drag
    setupDrag(header);

    // Setup resize for all handles
    setupResize(resizeCorner, 'corner-br');
    setupResize(resizeEdgeRight, 'edge-right');
    setupResize(resizeEdgeLeft, 'edge-left');
    setupResize(resizeEdgeBottom, 'edge-bottom');
    setupResize(resizeEdgeTop, 'edge-top');
  }

  function setupDrag(header) {
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.claude-panel-btn')) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const rect = container.getBoundingClientRect();
      const startLeft = rect.left;
      const startTop = rect.top;
      e.preventDefault();

      function onMove(e) {
        e.preventDefault();
        iframe.style.pointerEvents = 'none';

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        // Constrain to viewport
        const maxLeft = window.innerWidth - container.offsetWidth;
        const maxTop = window.innerHeight - container.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        container.style.left = newLeft + 'px';
        container.style.top = newTop + 'px';
        container.style.right = 'auto';
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        iframe.style.pointerEvents = '';

        const rect = container.getBoundingClientRect();
        panelState.x = rect.left;
        panelState.y = rect.top;
        saveState();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function setupResize(handle, direction) {
    handle.addEventListener('mousedown', (e) => {
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = container.getBoundingClientRect();
      const startWidth = rect.width;
      const startHeight = rect.height;
      const startLeft = rect.left;
      const startTop = rect.top;
      e.preventDefault();
      e.stopPropagation();

      function onMove(e) {
        e.preventDefault();
        iframe.style.pointerEvents = 'none';

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (direction === 'corner-br') {
          const maxWidth = window.innerWidth - startLeft;
          const maxHeight = window.innerHeight - startTop;
          const newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + dx));
          const newHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeight + dy));
          container.style.width = newWidth + 'px';
          container.style.height = newHeight + 'px';
        } else if (direction === 'edge-right') {
          const maxWidth = window.innerWidth - startLeft;
          const newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + dx));
          container.style.width = newWidth + 'px';
        } else if (direction === 'edge-left') {
          let newWidth = Math.max(MIN_WIDTH, startWidth - dx);
          let newLeft = startLeft + (startWidth - newWidth);
          if (newLeft < 0) {
            newLeft = 0;
            newWidth = Math.max(MIN_WIDTH, startLeft + startWidth);
          }
          container.style.width = newWidth + 'px';
          container.style.left = newLeft + 'px';
          container.style.right = 'auto';
        } else if (direction === 'edge-bottom') {
          const maxHeight = window.innerHeight - startTop;
          const newHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeight + dy));
          container.style.height = newHeight + 'px';
        } else if (direction === 'edge-top') {
          let newHeight = Math.max(MIN_HEIGHT, startHeight - dy);
          let newTop = startTop + (startHeight - newHeight);
          if (newTop < 0) {
            newTop = 0;
            newHeight = Math.max(MIN_HEIGHT, startTop + startHeight);
          }
          container.style.height = newHeight + 'px';
          container.style.top = newTop + 'px';
        }
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        iframe.style.pointerEvents = '';

        const rect = container.getBoundingClientRect();
        panelState.width = rect.width;
        panelState.height = rect.height;
        panelState.x = rect.left;
        panelState.y = rect.top;
        saveState();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function applyPosition() {
    container.style.width = panelState.width + 'px';
    container.style.height = panelState.height + 'px';

    if (panelState.x !== null) {
      // Ensure saved position is still within viewport
      const maxLeft = window.innerWidth - panelState.width;
      const maxTop = window.innerHeight - panelState.height;
      const x = Math.max(0, Math.min(panelState.x, maxLeft));
      const y = Math.max(0, Math.min(panelState.y, maxTop));
      container.style.left = x + 'px';
      container.style.top = y + 'px';
      container.style.right = 'auto';
    } else {
      // Default: top-right
      container.style.right = '20px';
      container.style.top = panelState.y + 'px';
    }
  }

  function showPanel(tabId, extensionId) {
    if (!panelEl) createPanel();

    // Set iframe src if not already set
    const extId = extensionId || chrome.runtime.id;
    const targetSrc = `chrome-extension://${extId}/sidepanel.html?tabId=${encodeURIComponent(tabId || '')}`;
    if (iframe.src !== targetSrc) {
      iframe.src = targetSrc;
    }

    applyPosition();

    // Trigger animation
    requestAnimationFrame(() => {
      container.classList.add('visible');
    });

    isVisible = true;
    panelState.open = true;
    saveState();

    // Close on Escape
    escapeKeyListener = (e) => {
      if (e.key === 'Escape') hidePanel();
    };
    document.addEventListener('keydown', escapeKeyListener);
  }

  function hidePanel() {
    if (!container) return;

    container.classList.remove('visible');
    isVisible = false;
    panelState.open = false;
    saveState();

    if (escapeKeyListener) {
      document.removeEventListener('keydown', escapeKeyListener);
      escapeKeyListener = null;
    }

    // Remove iframe src after animation to free resources
    setTimeout(() => {
      if (!isVisible && iframe) {
        iframe.src = 'about:blank';
      }
    }, 250);
  }

  function togglePanel(tabId, extensionId) {
    if (isVisible) {
      hidePanel();
    } else {
      showPanel(tabId, extensionId);
    }
  }

  // Gate message handling on state being loaded so first toggle uses correct position
  let stateLoaded = false;
  const statePromise = loadState().then(() => { stateLoaded = true; });

  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isExtensionValid()) return false;
    if (message.type === 'TOGGLE_FLOATING_PANEL') {
      if (!stateLoaded) {
        statePromise.then(() => {
          togglePanel(message.tabId, message.extensionId);
          sendResponse({ success: true });
        });
        return true; // keep channel open for async sendResponse
      }
      togglePanel(message.tabId, message.extensionId);
      sendResponse({ success: true });
    }
    return false;
  });


})();
