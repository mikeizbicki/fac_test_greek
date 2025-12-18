document.addEventListener('DOMContentLoaded', function() {
    const frames = document.querySelectorAll('.frame');
    const container = document.getElementById('book-container');
    const level = container.dataset.level;
    const book = container.dataset.book;

    function adjustFrameHeights() {
        frames.forEach(frame => {
            const frameMargin = frame.querySelector('.frame-margin');
            const marginHeight = frameMargin.offsetHeight;
            const currentMinHeight = parseInt(getComputedStyle(frame).minHeight) || 0;

            if (marginHeight > currentMinHeight) {
                frame.style.minHeight = (marginHeight + 20) + 'px';
            }
        });
    }

    function loadFrameJson(frame, textarea) {
        const frameId = frame.dataset.frameId;
        fetch(`/books/${level}/${book}/get_frame_json/${frameId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    textarea.value = JSON.stringify(data.frame_data, null, 2);
                    textarea.dataset.loaded = 'true';
                }
            })
            .catch(console.error);
    }

    function deleteFrame(frameId, frameElement) {
        fetch(`/books/${level}/${book}/delete_frame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frame_id: frameId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) frameElement.remove();
            else alert('Error deleting: ' + data.error);
        });
    }

    function addNewFrame(afterFrame) {
        const newId = 'frame_' + Date.now();
        fetch(`/books/${level}/${book}/add_frame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frame_id: newId, after_frame: afterFrame.dataset.frameId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) location.reload();
            else alert('Error adding: ' + data.error);
        });
    }

    function mergeWithNext(frame) {
        const nextFrame = frame.nextElementSibling;
        if (!nextFrame || !nextFrame.classList.contains('frame')) {
            alert('No next frame to merge with');
            return;
        }

        if (confirm('Merge this frame with the next one?')) {
            fetch(`/books/${level}/${book}/merge_frames`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    frame_id: frame.dataset.frameId,
                    next_frame_id: nextFrame.dataset.frameId
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) location.reload();
                else alert('Error merging: ' + data.error);
            });
        }
    }

    function exitEditMode(frame) {
        const frameContent = frame.querySelector('.frame-content');
        const frameEdit = frame.querySelector('.frame-edit');
        const frameControls = frame.querySelector('.frame-controls');

        frameContent.style.display = 'block';
        frameEdit.style.display = 'none';
        frameControls.style.display = ''; // Reset to default (CSS will handle hover)
    }

    function enterEditMode(frame) {
        const frameContent = frame.querySelector('.frame-content');
        const frameEdit = frame.querySelector('.frame-edit');
        const frameControls = frame.querySelector('.frame-controls');
        const textarea = frame.querySelector('.frame-textarea');

        textarea.value = frame.dataset.rawContent;
        frameContent.style.display = 'none';
        frameEdit.style.display = 'block';
        frameControls.style.display = 'none';
        textarea.focus();
    }

    adjustFrameHeights();

    // reference_frame drop down
    frames.forEach(frame => {
        const refContainer = frame.querySelector('.reference-frame-container');
        const refValue = frame.querySelector('.reference-frame-value');
        const refDropdown = frame.querySelector('.reference-frame-dropdown');

        // Populate dropdown with previous frames
        const frameId = frame.dataset.frameId;
        const allFrames = Array.from(document.querySelectorAll('.frame'));
        const currentIndex = allFrames.indexOf(frame);

        // Clear existing options except 'none'
        refDropdown.innerHTML = '<option value="">none</option>';

        for (let i = 0; i < currentIndex; i++) {
            const option = document.createElement('option');
            option.value = allFrames[i].dataset.frameId;
            option.textContent = allFrames[i].dataset.frameId;
            refDropdown.appendChild(option);
        }

        refValue.addEventListener('click', function() {
            // Set current value as selected
            refDropdown.value = this.dataset.referenceFrame;

            // Calculate size (number of options to show)
            const optionCount = refDropdown.options.length;
            const maxSize = Math.min(optionCount, 8); // Show max 8 options
            refDropdown.size = maxSize;

            refDropdown.style.display = 'block';
            refDropdown.focus();
        });

        refDropdown.addEventListener('change', function() {
            const newRefFrame = this.value;
            refValue.innerHTML = `${newRefFrame || 'none'} <span style="color: gray;">(updating...)</span>`;
            this.style.display = 'none';
            this.size = 1;

            fetch(`/books/${level}/${book}/update_reference_frame`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    frame_id: frameId,
                    reference_frame: newRefFrame
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    refValue.dataset.referenceFrame = newRefFrame;
                    refValue.textContent = newRefFrame || 'none';
                    frame.dataset.referenceFrame = newRefFrame;
                    drawReferenceArrows();
                } else {
                    alert('Error updating: ' + data.error);
                    refValue.textContent = refValue.dataset.referenceFrame || 'none';
                }
            });
        });

        refDropdown.addEventListener('blur', function() {
            this.style.display = 'none';
            this.size = 1;
        });
    });


    frames.forEach(frame => {
        const frameContent = frame.querySelector('.frame-content');
        const frameEdit = frame.querySelector('.frame-edit');
        const frameControls = frame.querySelector('.frame-controls');
        const textarea = frame.querySelector('.frame-textarea');
        const jsonTextarea = frame.querySelector('.frame-json-textarea');
        const runButton = frame.querySelector('.run-button');
        const cancelButton = frame.querySelector('.cancel-button');

        // Control buttons
        const editBtn = frame.querySelector('.edit-btn');
        const deleteBtn = frame.querySelector('.delete-btn');
        const addBtn = frame.querySelector('.add-btn');

        // Tab handling
        const tabButtons = frame.querySelectorAll('.tab-button');
        const tabContents = frame.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                const tabName = this.dataset.tab;

                // Update active tab
                tabButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');

                // Show corresponding content
                tabContents.forEach(content => content.style.display = 'none');
                frame.querySelector(`#${tabName}-tab`).style.display = 'block';

                // Load JSON data when switching to JSON tab
                if (tabName === 'json' && !jsonTextarea.dataset.loaded) {
                    loadFrameJson(frame, jsonTextarea);
                }
            });
        });

        // Control button event listeners
        editBtn.addEventListener('click', function() {
            enterEditMode(frame);
        });

        deleteBtn.addEventListener('click', function() {
            if (confirm('Delete this frame?')) {
                deleteFrame(frame.dataset.frameId, frame);
            }
        });

        addBtn.addEventListener('click', function() {
            addNewFrame(frame);
        });

        // Escape key handler for this frame's textareas
        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                exitEditMode(frame);
            }
        });

        jsonTextarea.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                exitEditMode(frame);
            }
        });

        // Existing functionality

        frameContent.addEventListener('dblclick', function() {
            enterEditMode(frame);
        });

        cancelButton.addEventListener('click', function() {
            exitEditMode(frame);
        });

        // Updated save button - now saves both fountain and JSON
        runButton.addEventListener('click', function() {
            const frameId = frame.dataset.frameId;
            const fountainContent = textarea.value;
            const jsonContent = jsonTextarea.value || null;

            fetch(`/books/${level}/${book}/save_frame`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    frame_id: frameId,
                    fountain_content: fountainContent,
                    json_content: jsonContent
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    frame.dataset.rawContent = fountainContent;
                    frameContent.innerHTML = data.html;
                    jsonTextarea.dataset.loaded = 'false'; // Reset for next edit
                    exitEditMode(frame);

                    // Update reference frame data attribute if JSON was saved
                    if (jsonContent) {
                        try {
                            const jsonData = JSON.parse(jsonContent);
                            frame.dataset.referenceFrame = jsonData.reference_frame || '';
                        } catch (e) {
                            console.error('Error parsing JSON:', e);
                        }
                    }

                    // Redraw arrows after saving
                    drawReferenceArrows();
                } else {
                    alert('Error saving: ' + data.error);
                }
            })
            .catch(error => {
                alert('Error: ' + error);
            });
        });

        const img = frame.querySelector('.frame-image');
        if (img) {
            img.addEventListener('load', adjustFrameHeights);
            img.addEventListener('error', function() {
                this.classList.add('error');
                this.style.display = 'flex'; // Ensure it shows as a box
                adjustFrameHeights();
            });
        }
    });
});

// Arrow drawing javascript
function drawReferenceArrows() {
    const svg = document.getElementById('arrow-container');
    svg.innerHTML = svg.innerHTML.replace(/<path[^>]*class="reference-arrow"[^>]*><\/path>/g, ''); // Clear existing arrows
    
    const frames = Array.from(document.querySelectorAll('[data-reference-frame]'));
    
    frames.forEach((frame, currentIndex) => {
        const refId = frame.dataset.referenceFrame;
        if (!refId) return;
        
        const targetFrame = document.getElementById(refId);
        if (!targetFrame) return;

        const sourceHeader = frame.querySelector('.frame_id');
        const targetHeader = targetFrame.querySelector('.frame_id');
        
        if (!sourceHeader || !targetHeader) return;
        
        const fromRect = sourceHeader.getBoundingClientRect();
        const toRect = targetHeader.getBoundingClientRect();
        
        const startX = fromRect.right + 20;
        const startY = fromRect.top + fromRect.height / 2;
        const endX = toRect.right + 20;
        const endY = toRect.top + toRect.height / 2;
        
        const offset = 20;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'reference-arrow');
        path.setAttribute('d', `M ${startX} ${startY} Q ${startX + offset} ${(startY + endY) / 2} ${endX} ${endY}`);
        
        svg.appendChild(path);
    });
}

document.addEventListener('DOMContentLoaded', drawReferenceArrows);
window.addEventListener('resize', drawReferenceArrows);
window.addEventListener('scroll', drawReferenceArrows);
