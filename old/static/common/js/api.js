// API utilities for interacting with fac backend

class FacAPI {
    static async get(endpoint) {
        try {
            const response = await fetch(`/api${endpoint}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API GET error:', error);
            throw error;
        }
    }
    
    static async post(endpoint, data = {}) {
        try {
            const response = await fetch(`/api${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API POST error:', error);
            throw error;
        }
    }
    
    static async getScopes() {
        return await this.get('/scopes');
    }
    
    static async getScopeTargets(scope) {
        return await this.get(`/scopes/${scope}/targets`);
    }
    
    static async getTargetData(scope, target) {
        return await this.get(`/scopes/${scope}/targets/${target}`);
    }
    
    static async triggerBuild(target) {
        return await this.post(`/build/trigger/${target}`);
    }
    
    static async getBuildStatus(target) {
        return await this.get(`/build/status/${target}`);
    }
}

// Global function for rebuild button
async function rebuildTarget(target) {
    const btn = document.getElementById('rebuild-btn');
    const status = document.getElementById('build-status');
    
    if (!btn || !target) return;
    
    btn.disabled = true;
    btn.textContent = 'Building...';
    status.textContent = 'Building...';
    
    try {
        const result = await FacAPI.triggerBuild(target);
        
        if (result.success) {
            status.textContent = 'Build successful';
            status.className = 'success';
            
            // Reload the current target data
            if (window.currentScope && typeof window.loadTargetData === 'function') {
                window.loadTargetData(target);
            }
        } else {
            status.textContent = `Build failed: ${result.stderr || result.error}`;
            status.className = 'error';
        }
    } catch (error) {
        status.textContent = `Build error: ${error.message}`;
        status.className = 'error';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Rebuild';
        
        // Clear status after 5 seconds
        setTimeout(() => {
            status.textContent = '';
            status.className = '';
        }, 5000);
    }
}

