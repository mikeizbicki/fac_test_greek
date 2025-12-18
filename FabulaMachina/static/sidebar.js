class Sidebar {
    constructor() {
        this.historyEventSource = null;
        this.debugEventSource = null;
        this.currentTab = 'history';
        this.isCollapsed = window.innerWidth <= 768;

        this.initializeElements();
        this.setupEventListeners();
        this.connectHistoryStream();
        this.connectDebugStream();
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
        this.debugOutput = document.getElementById('debug-output');
        this.clearDebugBtn = document.getElementById('clear-debug');
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

        // Clear debug
        this.clearDebugBtn.addEventListener('click', () => {
            this.clearDebug();
        });

        // Responsive handling
        window.addEventListener('resize', () => {
            if (window.innerWidth <= 768 && !this.isCollapsed) {
                this.toggleSidebar(false);
            }
        });
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
                    this.addDebugLine(`Checked out: ${data.data.message}`, 'info');
                    break;
            }
        };

        this.historyEventSource.onerror = () => {
            setTimeout(() => this.connectHistoryStream(), 5000);
        };
    }

    connectDebugStream() {
        if (this.debugEventSource) {
            this.debugEventSource.close();
        }

        this.debugEventSource = new EventSource('/api/fac/debug/events');

        this.debugEventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'debug_log':
                    this.addDebugLine(data.message, data.level.toLowerCase());
                    break;
                case 'clear_debug':
                    this.debugOutput.innerHTML = '';
                    break;
            }
        };

        this.debugEventSource.onerror = () => {
            setTimeout(() => this.connectDebugStream(), 5000);
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
                <span class="commit-date">${timeStr}</span>
                <span class="commit-hash">* ${commit.hash}</span>
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
                this.addDebugLine(`✓ ${data.message}`, 'info');
                // History will be refreshed automatically via SSE
            } else {
                this.addDebugLine(`✗ Checkout failed: ${data.error}`, 'error');
            }
        } catch (error) {
            this.addDebugLine(`✗ Checkout error: ${error.message}`, 'error');
        }
    }

    addDebugLine(message, level = 'info') {
        const line = document.createElement('div');
        line.className = `debug-line ${level}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

        this.debugOutput.appendChild(line);
        this.debugOutput.scrollTop = this.debugOutput.scrollHeight;
    }

    async clearDebug() {
        try {
            await fetch('/api/fac/debug/clear', { method: 'POST' });
            this.debugOutput.innerHTML = '';
        } catch (error) {
            console.error('Failed to clear debug:', error);
        }
    }
}

// Initialize sidebar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.sidebar = new Sidebar();
});
