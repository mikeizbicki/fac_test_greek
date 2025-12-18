class Sidebar {
    constructor() {
        this.historyEventSource = null;
        this.consoleEventSource = null;
        this.currentTab = 'history';
        this.isCollapsed = window.innerWidth <= 768;
        this.isResizing = false;
        this.sidebarWidth = 320;

        this.initializeElements();
        this.setupEventListeners();
        this.connectHistoryStream();
        this.connectConsoleStream();
        this.loadHistory();

        // Auto-collapse on mobile
        if (this.isCollapsed) {
            this.toggleSidebar(false);
        }
    }

    initializeElements() {
        this.sidebar = document.getElementById('sidebar');
        this.sidebarToggle = document.getElementById('sidebar-toggle');
        this.mainContent = document.getElementById('main-content');
        this.historyList = document.getElementById('history-list');
        this.consoleOutput = document.getElementById('console-output');
        this.clearConsoleBtn = document.getElementById('clear-console');
        this.resizeHandle = document.querySelector('.sidebar-resize-handle');
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        // Sidebar toggle
        this.sidebarToggle.addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Clear console
        this.clearConsoleBtn.addEventListener('click', () => {
            this.clearConsole();
        });

        // Resize handling
        this.setupResizeHandling();

        // Responsive handling
        window.addEventListener('resize', () => {
            if (window.innerWidth <= 768 && !this.isCollapsed) {
                this.toggleSidebar(false);
            }
        });
    }

    setupResizeHandling() {
        let startX, startWidth;

        this.resizeHandle.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            startX = e.clientX;
            startWidth = this.sidebarWidth;

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';

            e.preventDefault();
        });

        const handleMouseMove = (e) => {
            if (!this.isResizing) return;

            const newWidth = Math.max(200, Math.min(window.innerWidth * 0.5, startWidth + (e.clientX - startX)));
            this.setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            this.isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }

    setSidebarWidth(width) {
        this.sidebarWidth = width;
        this.sidebar.style.width = width + 'px';
        if (!this.isCollapsed) {
            this.mainContent.style.marginLeft = width + 'px';
        }
    }

    switchTab(tabName) {
        // Update buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        this.currentTab = tabName;
    }

    toggleSidebar(show = null) {
        const shouldShow = show !== null ? show : this.sidebar.classList.contains('collapsed');

        this.sidebar.classList.toggle('collapsed', !shouldShow);
        this.sidebarToggle.classList.toggle('collapsed', !shouldShow);
        this.mainContent.classList.toggle('sidebar-collapsed', !shouldShow);

        // Update main content margin
        if (shouldShow) {
            this.mainContent.style.marginLeft = this.sidebarWidth + 'px';
        } else {
            this.mainContent.style.marginLeft = '0px';
        }

        this.sidebarToggle.innerHTML = shouldShow ? '◀' : '▶';
        this.sidebarToggle.title = shouldShow ? 'Hide Sidebar' : 'Show Sidebar';

        this.isCollapsed = !shouldShow;
    }

    connectHistoryStream() {
        if (this.historyEventSource) {
            this.historyEventSource.close();
        }

        this.historyEventSource = new EventSource('/api/git/history/events');

        this.historyEventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'new_commit':
                    this.loadHistory(); // Refresh history when new commit
                    break;
                case 'checkout':
                    this.loadHistory(); // Refresh to show current commit
                    this.addConsoleLine(`Checked out: ${data.data.message}`, 'info');
                    break;
            }
        };

        this.historyEventSource.onerror = () => {
            setTimeout(() => this.connectHistoryStream(), 5000);
        };
    }

    connectConsoleStream() {
        if (this.consoleEventSource) {
            this.consoleEventSource.close();
        }

        this.consoleEventSource = new EventSource('/api/fac/console/events');

        this.consoleEventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'console_log':
                    this.addConsoleLine(data.message, data.level.toLowerCase());
                    break;
                case 'clear_console':
                    this.consoleOutput.innerHTML = '';
                    break;
            }
        };

        this.consoleEventSource.onerror = () => {
            setTimeout(() => this.connectConsoleStream(), 5000);
        };
    }

    async loadHistory() {
        try {
            const response = await fetch('/api/git/history');
            const data = await response.json();

            if (data.success) {
                this.renderHistory(data.commits);
            }
        } catch (error) {
            console.error('Failed to load git history:', error);
        }
    }

    renderHistory(commits) {
        this.historyList.innerHTML = '';

        commits.forEach(commit => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.dataset.hash = commit.full_hash;

            const date = new Date(commit.date * 1000);
            const timeStr = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            item.innerHTML = `
                <span class="commit-time">* ${timeStr}</span>
                <span class="commit-message">${commit.message}</span>
            `;

            item.addEventListener('click', () => {
                this.checkoutCommit(commit.full_hash);
            });

            this.historyList.appendChild(item);
        });
    }

    async checkoutCommit(hash) {
        try {
            const response = await fetch('/api/git/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commit_hash: hash })
            });

            const data = await response.json();

            if (data.success) {
                this.addConsoleLine(`✓ ${data.message}`, 'info');
                // History will be refreshed automatically via SSE
            } else {
                this.addConsoleLine(`✗ Checkout failed: ${data.error}`, 'error');
            }
        } catch (error) {
            this.addConsoleLine(`✗ Checkout error: ${error.message}`, 'error');
        }
    }

    addConsoleLine(message, level = 'info') {
        const line = document.createElement('div');
        line.className = `console-line ${level}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

        this.consoleOutput.appendChild(line);
        this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight;
    }

    async clearConsole() {
        try {
            await fetch('/api/fac/console/clear', { method: 'POST' });
            this.consoleOutput.innerHTML = '';
        } catch (error) {
            console.error('Failed to clear console:', error);
        }
    }
}

// Initialize sidebar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.sidebar = new Sidebar();
});
