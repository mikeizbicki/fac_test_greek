/* Audio Controls for Dialog Frames */
class DialogAudioControls {
    constructor() {
        this.level = null;
        this.book = null;
        this.init();
    }

    init() {
        // Get level and book from container
        const container = document.getElementById('book-container');
        if (container) {
            this.level = container.dataset.level;
            this.book = container.dataset.book;
        }
    }

    addAudioButtonsToDialogs() {
        const frames = document.querySelectorAll('.frame');

        frames.forEach(frame => {
            const frameId = frame.dataset.frameId;
            const audioPath = `/books/${this.level}/${this.book}/frames/${frameId}/page.wav`;

            // Find all dialog divs in this frame
            const dialogDivs = frame.querySelectorAll('.frame-content div.dialog');

            dialogDivs.forEach(dialogDiv => {
                // Check if audio button already exists
                if (dialogDiv.querySelector('.audio-button')) return;

                // Find the last p tag in this dialog
                const pTags = dialogDiv.querySelectorAll('p');
                const lastP = pTags[pTags.length - 1];

                if (lastP) {
                    this.createAudioButton(lastP, audioPath);
                }
            });
        });
    }

    createAudioButton(lastP, audioPath) {
        // Create an audio control container (compatible with existing audio.js system)
        const audioControl = document.createElement('div');
        audioControl.className = 'audio-controls';
        audioControl.dataset.audioPath = audioPath;

        // Style it to appear inline with dialog
        audioControl.style.cssText = `
            margin: 2px 0 0 76.67pt;
            display: block;
        `;

        // Insert after the last p tag
        lastP.parentNode.insertBefore(audioControl, lastP.nextSibling);

        // Use the existing audio system to set up this control
        if (window.initializeAudioControl) {
            window.initializeAudioControl(audioControl);
        } else {
            // Fallback if audio.js hasn't loaded yet
            console.warn('Audio system not ready, will retry...');
            setTimeout(() => {
                if (window.initializeAudioControl) {
                    window.initializeAudioControl(audioControl);
                } else {
                    console.error('Audio system failed to load');
                }
            }, 1000);
        }
    }

    // Method to refresh audio buttons (call after content updates)
    refresh() {
        this.addAudioButtonsToDialogs();
    }

    // Method to remove all audio buttons (useful for cleanup)
    removeAllAudioButtons() {
        const dialogAudioButtons = document.querySelectorAll('div.dialog .audio-controls');
        dialogAudioButtons.forEach(control => control.remove());
    }
}

// Initialize audio controls when DOM is ready
let dialogAudioControls = null;

document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit to ensure other scripts are loaded
    setTimeout(() => {
        dialogAudioControls = new DialogAudioControls();
        dialogAudioControls.addAudioButtonsToDialogs();
    }, 300);
});

// Export for use in other scripts
window.DialogAudioControls = DialogAudioControls;
window.dialogAudioControls = dialogAudioControls;

