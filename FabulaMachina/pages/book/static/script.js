document.addEventListener('DOMContentLoaded', function() {
    const frames = document.querySelectorAll('.frame');
    const container = document.getElementById('book-container');
    const level = container.dataset.level;
    const book = container.dataset.book;

    assignFrameColors();
    setTimeout(drawReferenceArrows, 100); // Small delay to ensure layout is complete

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

        // Get content from data attribute
        let content = frame.dataset.rawContent;
        if (!content) {
            content = frame.getAttribute('data-raw-content') || '';
        }

        textarea.value = content;

        // Ensure fountain tab is active and visible when entering edit mode
        const tabButtons = frame.querySelectorAll('.tab-button');
        const tabContents = frame.querySelectorAll('.tab-content');

        // Set fountain tab as active
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === 'fountain');
        });

        // Show fountain tab content, hide others
        tabContents.forEach(content => {
            if (content.id === 'fountain-tab') {
                content.style.display = 'block';
            } else {
                content.style.display = 'none';
            }
        });

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
                    assignFrameColors();
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


function assignFrameColors() {
    const frames = document.querySelectorAll('.frame');
    const frameColors = new Map();

    // Predefined color palette for root frames (no reference)
    const colorPalette = [
        '#fff740', // Yellow
        '#ff7eb9', // Pink
        '#7afcff', // Light blue
        '#98fb98', // Light green
        '#ffd1dc', // Light pink
        '#ffa07a', // Light salmon
        '#dda0dd', // Plum
        '#f0e68c', // Khaki
        '#87ceeb', // Sky blue
        '#ffefd5'  // Papaya whip
    ];

    let colorIndex = 0;

    frames.forEach(frame => {
        const frameId = frame.dataset.frameId;
        const referenceFrame = frame.dataset.referenceFrame;
        const frameMargin = frame.querySelector('.frame-margin');

        if (!frameMargin) return;

        let color;

        if (!referenceFrame || referenceFrame === 'none' || referenceFrame === '') {
            // Root frame - assign a new color from palette
            color = colorPalette[colorIndex % colorPalette.length];
            colorIndex++;
        } else {
            // Referenced frame - inherit color from reference
            color = frameColors.get(referenceFrame);

            // Fallback if reference frame color not found
            if (!color) {
                console.warn(`Reference frame "${referenceFrame}" not found for frame "${frameId}", using default color`);
                color = '#ffffff'; // Default yellow
            }
        }

        // Store color for this frame
        frameColors.set(frameId, color);

        // Apply color directly with !important to override CSS
        frameMargin.style.setProperty('background-color', color);

        console.log(`Applied color ${color} to frame ${frameId} (ref: ${referenceFrame || 'none'})`);
    });
}

function drawReferenceArrows() {
    // Remove existing SVG
    const existingSvg = document.getElementById('arrow-svg');
    if (existingSvg) existingSvg.remove();

    const bookContainer = document.getElementById('book-container');
    if (!bookContainer) return;

    // Create new SVG positioned relative to book container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'arrow-svg';
    bookContainer.appendChild(svg);

    // Add crayon filter for rough texture
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
        <filter id="crayon-filter" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.9" numOctaves="3" seed="2" />
            <feDisplacementMap in="SourceGraphic" scale="2" />
        </filter>
    `;
    svg.appendChild(defs);

    const frames = document.querySelectorAll('.frame');
    const framePositions = new Map();
    const frameColors = new Map();
    const containerRect = bookContainer.getBoundingClientRect();

    // Get frame positions and colors relative to book container
    frames.forEach(frame => {
        const frameId = frame.dataset.frameId;
        const frameRect = frame.getBoundingClientRect();
        const frameMargin = frame.querySelector('.frame-margin');

        // Get the background color from the sticky note
        const backgroundColor = frameMargin ?
            window.getComputedStyle(frameMargin).backgroundColor : '#fff740';

        // Calculate position relative to book container
        const relativeX = frameRect.left - containerRect.left;
        const relativeY = frameRect.top - containerRect.top;

        framePositions.set(frameId, {
            x: relativeX,
            y: relativeY,
            width: frameRect.width,
            height: frameRect.height
        });

        frameColors.set(frameId, backgroundColor);
    });

    // Draw arrows for non-adjacent references
    frames.forEach((frame, index) => {
        const frameId = frame.dataset.frameId;
        const referenceFrame = frame.dataset.referenceFrame;

        if (!referenceFrame || referenceFrame === 'none' || referenceFrame === '') return;

        // Check if reference is not the immediately previous frame
        const previousFrame = frames[index - 1];
        const isPreviousFrame = previousFrame && previousFrame.dataset.frameId === referenceFrame;

        if (!isPreviousFrame) {
            const fromPos = framePositions.get(frameId);
            const toPos = framePositions.get(referenceFrame);
            const arrowColor = frameColors.get(frameId);

            if (fromPos && toPos && arrowColor) {
                // Create unique marker ID for this arrow color
                const markerId = `arrow-head-${frameId}`;

                // Add colored marker to defs
                const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
                marker.setAttribute('id', markerId);
                marker.setAttribute('markerWidth', '15');
                marker.setAttribute('markerHeight', '12');
                marker.setAttribute('refX', '12');
                marker.setAttribute('refY', '4');
                marker.setAttribute('orient', 'auto');
                marker.setAttribute('markerUnits', 'strokeWidth');

                const arrowHead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                arrowHead.setAttribute('d', 'M0,0 L0,8 L12,4 z');
                arrowHead.setAttribute('fill', arrowColor);
                arrowHead.setAttribute('stroke', arrowColor);
                arrowHead.setAttribute('stroke-width', '1');

                /*marker.appendChild(arrowHead);*/
                defs.appendChild(marker);

                // Calculate arrow positions
                const stickyRightEdge = fromPos.x + fromPos.width + 220;
                const startX = stickyRightEdge;
                const startY = fromPos.y + 50;

                const refStickyRightEdge = toPos.x + toPos.width + 220;
                const endX = refStickyRightEdge;
                const endY = toPos.y + 50;

                const midX = Math.max(startX, endX) + 200;
                const midY = (startY + endY) / 2;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`);
                /*path.setAttribute('class', 'reference-arrow');*/

                // Explicitly set stroke properties to override CSS
                path.setAttribute('stroke', arrowColor);
                path.setAttribute('stroke-width', '5');
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke-linecap', 'round');
                path.setAttribute('stroke-linejoin', 'round');
                path.setAttribute('opacity', '0.9');
                path.setAttribute('filter', 'url(#crayon-filter)');
                path.setAttribute('marker-end', `url(#${markerId})`);

                svg.appendChild(path);
            }
        }
    });
}
