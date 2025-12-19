/**
 * AUTO-UPDATER SYSTEM
 *
 * MOTIVATION:
 * This system provides real-time automatic updates for images and other assets in the web interface.
 * When files are modified on the server (e.g., new artwork is generated, images are replaced),
 * the corresponding images in the browser should automatically refresh without requiring a page reload.
 * This creates a seamless workflow where users can see changes immediately as files are updated.
 *
 * ARCHITECTURE:
 * 1. CLIENT-SIDE: Uses MutationObserver to automatically detect <img> elements with the "auto-updater" class
 * 2. SUBSCRIPTION: For each detected image, extracts the file path and subscribes to server-side file watching
 * 3. COMMUNICATION: Uses Server-Sent Events (SSE) to receive real-time notifications from the server
 * 4. PATH NORMALIZATION: Handles URL timestamps and query parameters to maintain consistent file path tracking
 * 5. UPDATE HANDLING: When file change events are received, updates image src with cache-busting timestamp
 * 6. VISUAL FEEDBACK: Shows loading spinners, "file deleted" states, and other status indicators
 * 7. CLEANUP: Automatically unsubscribes from file watching when images are removed from the DOM
 *
 * USAGE:
 * Simply add the "auto-updater" class to any <img> element. The system will automatically:
 * - Subscribe to file change notifications for that image's src path
 * - Update the image when the file changes on the server
 * - Handle edge cases like rapid updates, missing files, and network errors
 * - Clean up subscriptions when the image is removed from the page
 */

// the debugLog function should be used instead of console.log for debug messages
const urlParams = new URLSearchParams(window.location.search);
const DEBUG = urlParams.get('debug') === 'true' ||
              localStorage.getItem('autoUpdaterDebug') === 'true';
const debugLog = DEBUG ? console.log.bind(console, 'AutoUpdater:') : () => {};


class AutoUpdater {
    constructor() {
        this.eventSource = null;
        this.subscribedPaths = new Set();
        this.imageElements = new Map(); // path -> Set of img elements
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.clientId = null;
        this.pendingSubscriptions = new Set(); // Paths waiting for client ID
        this.pendingUpdates = new Map(); // path -> timeout ID (for debouncing)

        debugLog('AutoUpdater: Initializing...');
        this.startObserving(); // Start observing first
        this.connect(); // Then connect
    }

    // Helper method to normalize paths (remove query parameters and fragments)
    normalizePath(src) {
        if (!src) return null;

        let path;
        if (src.startsWith('/')) {
            path = src;
        } else {
            path = new URL(src, window.location.href).pathname;
        }

        // Remove query parameters and fragments
        return path.split('?')[0].split('#')[0];
    }

    connect() {
        debugLog('AutoUpdater: Attempting to connect...');
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource('/api/auto_updater/events');

        this.eventSource.onopen = () => {
            debugLog('AutoUpdater: Connected successfully');
            this.reconnectAttempts = 0;
        };

        this.eventSource.onmessage = (event) => {
            debugLog('AutoUpdater: Received message:', event.data);
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'connected') {
                    this.clientId = message.client_id;
                    debugLog('AutoUpdater: Got client ID:', this.clientId);
                    // Now that we have client ID, process pending subscriptions
                    this.processPendingSubscriptions();
                } else {
                    this.handleMessage(message);
                }
            } catch (e) {
                console.error('AutoUpdater: Invalid message format:', e);
            }
        };

        this.eventSource.onerror = (event) => {
            console.warn('AutoUpdater: Connection error', event);
            this.eventSource.close();
            this.clientId = null; // Reset client ID on disconnect
            this.scheduleReconnect();
        };
    }

    async processPendingSubscriptions() {
        debugLog(`AutoUpdater: Processing ${this.pendingSubscriptions.size} pending subscriptions`);
        const pathsToSubscribe = Array.from(this.pendingSubscriptions);
        this.pendingSubscriptions.clear();

        for (const path of pathsToSubscribe) {
            await this.subscribePath(path);
        }

        // Also resubscribe to any existing subscriptions after reconnect
        const existingPaths = Array.from(this.subscribedPaths);
        this.subscribedPaths.clear();
        for (const path of existingPaths) {
            await this.subscribePath(path);
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
            setTimeout(() => {
                this.reconnectAttempts++;
                debugLog(`AutoUpdater: Reconnecting (attempt ${this.reconnectAttempts})`);
                this.connect();
            }, delay);
        } else {
            console.error('AutoUpdater: Max reconnection attempts reached');
        }
    }

    async subscribePath(path) {
        if (this.subscribedPaths.has(path)) {
            debugLog(`AutoUpdater: Already subscribed to ${path}`);
            return;
        }

        // If we don't have a client ID yet, queue the subscription
        if (!this.clientId) {
            debugLog(`AutoUpdater: Queueing subscription for ${path} (no client ID yet)`);
            this.pendingSubscriptions.add(path);
            return;
        }

        debugLog(`AutoUpdater: Attempting to subscribe to ${path}`);
        try {
            const response = await fetch('/api/auto_updater/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: path,
                    client_id: this.clientId
                })
            });

            const result = await response.json();
            if (response.ok && result.success) {
                this.subscribedPaths.add(path);
                debugLog(`AutoUpdater: Successfully subscribed to ${path}`);
            } else {
                console.error(`AutoUpdater: Failed to subscribe to ${path}:`, result.error);
            }
        } catch (e) {
            console.error(`AutoUpdater: Error subscribing to ${path}:`, e);
        }
    }

    async unsubscribePath(path) {
        if (!this.subscribedPaths.has(path)) {
            // Also remove from pending if it's there
            this.pendingSubscriptions.delete(path);
            return;
        }

        debugLog(`AutoUpdater: Unsubscribing from ${path}`);

        // If no client ID, just remove from local tracking
        if (!this.clientId) {
            this.subscribedPaths.delete(path);
            this.pendingSubscriptions.delete(path);
            return;
        }

        try {
            const response = await fetch('/api/auto_updater/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: path,
                    client_id: this.clientId
                })
            });

            if (response.ok) {
                this.subscribedPaths.delete(path);
                debugLog(`AutoUpdater: Unsubscribed from ${path}`);
            } else {
                console.error(`AutoUpdater: Failed to unsubscribe from ${path}`);
            }
        } catch (e) {
            console.error(`AutoUpdater: Error unsubscribing from ${path}:`, e);
        }
    }

    handleMessage(message) {
        debugLog('AutoUpdater: Handling message:', message);
        const { type, path, data } = message;

        if (type === 'heartbeat') {
            // Ignore heartbeats
            return;
        }

        const elements = this.imageElements.get(path);

        if (!elements) {
            debugLog(`AutoUpdater: No elements found for path ${path}`);
            return;
        }

        debugLog(`AutoUpdater: Found ${elements.size} elements for path ${path}`);

        switch (type) {
            case 'file_updated':
                this.handleFileUpdated(elements, path);
                break;
            case 'file_deleted':
                this.handleFileDeleted(elements);
                break;
            case 'file_updating':
                this.handleFileUpdating(elements);
                break;
            default:
                console.warn(`AutoUpdater: Unknown message type: ${type}`);
        }
    }

    handleFileUpdated(elements, path) {
        debugLog(`AutoUpdater: Updating ${elements.size} elements for ${path}`);

        // Cancel any pending update for this path
        if (this.pendingUpdates.has(path)) {
            clearTimeout(this.pendingUpdates.get(path));
        }

        // Debounce rapid updates to prevent NS_BINDING_ABORTED errors
        const timeoutId = setTimeout(() => {
            this.pendingUpdates.delete(path);

            elements.forEach(img => {
                this.removeOverlay(img);
                // Add timestamp to force reload, but preserve the normalized path tracking
                const currentSrc = img.getAttribute('src');
                const normalizedPath = this.normalizePath(currentSrc);

                if (normalizedPath === path) {
                    const url = new URL(currentSrc, window.location.href);
                    url.searchParams.set('t', Date.now());

                    // Temporarily disable the mutation observer for this change
                    this.ignoreNextSrcChange = true;
                    img.src = url.toString();

                    debugLog(`AutoUpdater: Updated image src to ${img.src}`);

                    // Re-enable observer after a short delay
                    setTimeout(() => {
                        this.ignoreNextSrcChange = false;
                    }, 100);
                }
            });
        }, 100); // 100ms debounce

        this.pendingUpdates.set(path, timeoutId);

        // Special reload code for the video tag
        if (img.tagName === 'VIDEO') {
            img.load();
        }
    }

    handleFileDeleted(elements) {
        debugLog(`AutoUpdater: Marking ${elements.size} elements as deleted`);
        elements.forEach(img => {
            this.removeOverlay(img);
            this.showDeletedState(img);
        });
    }

    handleFileUpdating(elements) {
        debugLog(`AutoUpdater: Showing updating state for ${elements.size} elements`);
        elements.forEach(img => {
            this.showUpdatingState(img);
        });
    }

    showUpdatingState(img) {
        this.removeOverlay(img);

        const overlay = document.createElement('div');
        overlay.className = 'auto-updater-overlay updating';
        overlay.innerHTML = `
            <div class="spinner"></div>
            <div class="status">Updating...</div>
        `;

        this.addOverlay(img, overlay);
    }

    showDeletedState(img) {
        img.style.display = 'flex';
        img.style.alignItems = 'center';
        img.style.justifyContent = 'center';
        img.style.backgroundColor = '#e0e0e0';
        img.style.color = '#666';
        img.style.fontSize = '12px';
        img.style.fontFamily = 'Arial, sans-serif';

        // Temporarily disable the mutation observer for this change
        this.ignoreNextSrcChange = true;
        img.src = 'data:image/svg+xml;base64,' + btoa(`
            <svg xmlns="http://www.w3.org/2000/svg" width="200" height="113">
                <rect width="200" height="113" fill="#e0e0e0"/>
                <text x="100" y="60" text-anchor="middle" fill="#666" font-size="12" font-family="Arial">file deleted</text>
            </svg>
        `);

        // Re-enable observer after a short delay
        setTimeout(() => {
            this.ignoreNextSrcChange = false;
        }, 100);
    }

    addOverlay(img, overlay) {
        const container = img.parentElement;
        if (!container.style.position || container.style.position === 'static') {
            container.style.position = 'relative';
        }
        container.appendChild(overlay);
        img.style.opacity = '0.5';
    }

    removeOverlay(img) {
        img.style.opacity = '';
        const container = img.parentElement;
        const overlays = container.querySelectorAll('.auto-updater-overlay');
        overlays.forEach(overlay => overlay.remove());
    }

    addImage(img) {
        const src = img.getAttribute('src');
        debugLog(`AutoUpdater: Adding image with src: ${src}`);
        if (!src) return;

        // Use normalized path for tracking
        const path = this.normalizePath(src);
        if (!path) return;

        debugLog(`AutoUpdater: Resolved normalized path: ${path}`);

        if (!this.imageElements.has(path)) {
            this.imageElements.set(path, new Set());
            debugLog(`AutoUpdater: Created new element set for path: ${path}`);
        }

        this.imageElements.get(path).add(img);
        debugLog(`AutoUpdater: Added element, total for path ${path}: ${this.imageElements.get(path).size}`);
        this.subscribePath(path);
    }

    removeImage(img) {
        const src = img.getAttribute('src');
        debugLog(`AutoUpdater: Removing image with src: ${src}`);
        if (!src) return;

        const path = this.normalizePath(src);
        if (!path) return;

        const elements = this.imageElements.get(path);

        if (elements) {
            elements.delete(img);
            debugLog(`AutoUpdater: Removed element, remaining for path ${path}: ${elements.size}`);
            if (elements.size === 0) {
                this.imageElements.delete(path);
                this.unsubscribePath(path);
                debugLog(`AutoUpdater: No more elements for path ${path}, unsubscribed`);
            }
        }
    }

    startObserving() {
        debugLog('AutoUpdater: Starting to observe DOM...');
        // Initial scan for existing images
        const existingImages = document.querySelectorAll('img.auto-updater');
        debugLog(`AutoUpdater: Found ${existingImages.length} existing auto-updater images`);
        existingImages.forEach(img => {
            this.addImage(img);
        });

        // Watch for new/removed images
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                // Handle added nodes
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches && node.matches('img.auto-updater')) {
                            debugLog('AutoUpdater: New auto-updater image added');
                            this.addImage(node);
                        }
                        // Check children
                        if (node.querySelectorAll) {
                            const newImages = node.querySelectorAll('img.auto-updater');
                            debugLog(`AutoUpdater: Found ${newImages.length} new auto-updater images in added subtree`);
                            newImages.forEach(img => {
                                this.addImage(img);
                            });
                        }
                    }
                });

                // Handle removed nodes
                mutation.removedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches && node.matches('img.auto-updater')) {
                            debugLog('AutoUpdater: Auto-updater image removed');
                            this.removeImage(node);
                        }
                        // Check children
                        if (node.querySelectorAll) {
                            const removedImages = node.querySelectorAll('img.auto-updater');
                            debugLog(`AutoUpdater: Found ${removedImages.length} auto-updater images in removed subtree`);
                            removedImages.forEach(img => {
                                this.removeImage(img);
                            });
                        }
                    }
                });

                // Handle attribute changes (src changes) - but ignore our own changes
                if (mutation.type === 'attributes' &&
                    mutation.attributeName === 'src' &&
                    mutation.target.classList.contains('auto-updater') &&
                    !this.ignoreNextSrcChange) {

                    debugLog('AutoUpdater: Auto-updater image src changed');

                    const oldSrc = mutation.oldValue;
                    const newSrc = mutation.target.getAttribute('src');
                    const oldPath = this.normalizePath(oldSrc);
                    const newPath = this.normalizePath(newSrc);

                    // Only update tracking if the normalized path actually changed
                    if (oldPath !== newPath) {
                        this.removeImage(mutation.target);
                        this.addImage(mutation.target);
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src'],
            attributeOldValue: true  // We need the old value to compare paths
        });
        debugLog('AutoUpdater: DOM observer started');
    }
}

// CSS for overlays (unchanged)
const style = document.createElement('style');
style.textContent = `
    .auto-updater-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .auto-updater-overlay .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid #ccc;
        border-top: 2px solid #666;
        border-radius: 50%;
        animation: auto-updater-spin 1s linear infinite;
        margin-bottom: 5px;
    }

    .auto-updater-overlay .status {
        font-size: 10px;
        color: #666;
        font-family: Arial, sans-serif;
    }

    @keyframes auto-updater-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Initialize when DOM is ready
let autoUpdater;
document.addEventListener('DOMContentLoaded', () => {
    autoUpdater = new AutoUpdater();
});

// Export for manual access if needed
window.AutoUpdater = AutoUpdater;

