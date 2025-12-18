// Utilities for embedding multimedia content

class MediaEmbedder {
    static embed(filename, container, options = {}) {
        const ext = filename.split('.').pop().toLowerCase();
        const url = `/api/files/${filename}`;
        
        let element;
        
        switch (ext) {
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'gif':
            case 'webp':
                element = this.createImage(url, options);
                break;
                
            case 'mp4':
            case 'webm':
            case 'ogg':
                element = this.createVideo(url, options);
                break;
                
            case 'wav':
            case 'mp3':
            case 'ogg':
                element = this.createAudio(url, options);
                break;
                
            default:
                element = this.createLink(url, filename, options);
        }
        
        if (container) {
            container.appendChild(element);
        }
        
        return element;
    }
    
    static createImage(url, options) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = options.alt || 'Media content';
        
        if (options.width) img.style.width = options.width;
        if (options.height) img.style.height = options.height;
        if (options.className) img.className = options.className;
        
        return img;
    }
    
    static createVideo(url, options) {
        const video = document.createElement('video');
        video.src = url;
        video.controls = options.controls !== false;
        
        if (options.width) video.style.width = options.width;
        if (options.height) video.style.height = options.height;
        if (options.className) video.className = options.className;
        if (options.autoplay) video.autoplay = true;
        if (options.loop) video.loop = true;
        
        return video;
    }
    
    static createAudio(url, options) {
        const audio = document.createElement('audio');
        audio.src = url;
        audio.controls = options.controls !== false;
        
        if (options.className) audio.className = options.className;
        if (options.autoplay) audio.autoplay = true;
        if (options.loop) audio.loop = true;
        
        return audio;
    }
    
    static createLink(url, filename, options) {
        const a = document.createElement('a');
        a.href = url;
        a.textContent = options.text || filename;
        a.target = options.target || '_blank';
        
        if (options.className) a.className = options.className;
        
        return a;
    }
    
    // Utility to scan text for media references and auto-embed
    static autoEmbed(text, container, pattern = /\[media:([^\]]+)\]/g) {
        const parts = text.split(pattern);
        
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                // Text content
                if (parts[i]) {
                    const textNode = document.createTextNode(parts[i]);
                    container.appendChild(textNode);
                }
            } else {
                // Media reference
                const filename = parts[i];
                this.embed(filename, container);
            }
        }
    }
}

// Global utility functions
window.MediaEmbedder = MediaEmbedder;

function embedMedia(filename, containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (container) {
        return MediaEmbedder.embed(filename, container, options);
    }
}

