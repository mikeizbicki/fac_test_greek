// Screenplay-specific JavaScript

class ScreenplayRenderer {
    constructor() {
        this.container = document.getElementById('scope-content');
        this.currentTarget = window.currentTarget;
        this.currentScope = window.currentScope;
    }
    
    async init() {
        if (this.currentTarget) {
            await this.loadTargetData(this.currentTarget);
        } else {
            await this.showTargetList();
        }
    }
    
    async showTargetList() {
        try {
            const targets = await FacAPI.getScopeTargets(this.currentScope);
            
            const listDiv = document.createElement('div');
            listDiv.className = 'target-list';
            
            if (targets.length === 0) {
                listDiv.innerHTML = '<p>No targets found for this scope.</p>';
            } else {
                targets.forEach(target => {
                    const card = document.createElement('div');
                    card.className = 'target-card';
                    card.onclick = () => this.navigateToTarget(target);
                    
                    card.innerHTML = `
                        <h4>${target}</h4>
                        <p>Click to view screenplay</p>
                    `;
                    
                    listDiv.appendChild(card);
                });
            }
            
            this.container.innerHTML = '';
            this.container.appendChild(listDiv);
            
        } catch (error) {
            this.showError(`Failed to load targets: ${error.message}`);
        }
    }
    
    async loadTargetData(target) {
        try {
            this.showLoading();
            
            const data = await FacAPI.getTargetData(this.currentScope, target);
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            this.renderScreenplay(data);
            
        } catch (error) {
            this.showError(`Failed to load target data: ${error.message}`);
        }
    }
    
    renderScreenplay(data) {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'screenplay-content';
        
        if (data.type === 'text' && data.content) {
            this.parseAndRenderScreenplayText(data.content, contentDiv);
        } else if (data.content) {
            // Handle JSON or other structured data
            contentDiv.textContent = JSON.stringify(data, null, 2);
        } else {
            contentDiv.textContent = 'No content available';
        }
        
        this.container.innerHTML = '';
        this.container.appendChild(contentDiv);
    }
    
    parseAndRenderScreenplayText(text, container) {
        const lines = text.split('\n');
        
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                container.appendChild(document.createElement('br'));
                return;
            }
            
            const element = this.classifyAndCreateElement(line);
            container.appendChild(element);
        });
        
        // Process any media embeds
        this.processMediaEmbeds(container);
    }
    
    classifyAndCreateElement(line) {
        const div = document.createElement('div');
        div.className = 'screenplay-element';
        
        const trimmed = line.trim();
        
        // Scene headings (INT./EXT.)
        if (/^(INT\.|EXT\.|FADE IN:|FADE OUT:)/i.test(trimmed)) {
            div.classList.add('scene-heading');
        }
        // Transitions
        else if (/^(CUT TO:|FADE TO:|DISSOLVE TO:)/.test(trimmed) || 
                 /(FADE OUT\.|THE END)$/.test(trimmed)) {
            div.classList.add('transition');
        }
        // Character names (all caps, centered-ish)
        else if (/^[A-Z][A-Z\s]+$/.test(trimmed) && 
                 trimmed.length < 40 && 
                 !trimmed.includes('.')) {
            div.classList.add('character');
        }
        // Parentheticals
        else if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
            div.classList.add('parenthetical');
        }
        // Dialogue (indented or following character)
        else if (line.match(/^\s{10,}/)) {
            div.classList.add('dialogue');
        }
        // Action/description
        else {
            div.classList.add('action');
        }
        
        div.textContent = line;
        return div;
    }
    
    processMediaEmbeds(container) {
        // Look for media references in the text and replace with embedded media
        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        const textNodes = [];
        let node;
        
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        
        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            const mediaPattern = /\[media:([^\]]+)\]/g;
            
            if (mediaPattern.test(text)) {
                const parent = textNode.parentNode;
                const mediaDiv = document.createElement('div');
                mediaDiv.className = 'media-embed';
                
                MediaEmbedder.autoEmbed(text, mediaDiv);
                
                parent.replaceChild(mediaDiv, textNode);
            }
        });
    }
    
    navigateToTarget(target) {
        window.location.href = `/${this.currentScope}/${target}`;
    }
    
    showLoading() {
        this.container.innerHTML = '<div class="loading">Loading...</div>';
    }
    
    showError(message) {
        this.container.innerHTML = `<div class="error">${message}</div>`;
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    const renderer = new ScreenplayRenderer();
    renderer.init();
    
    // Make loadTargetData available globally for rebuild functionality
    window.loadTargetData = (target) => renderer.loadTargetData(target);
});

