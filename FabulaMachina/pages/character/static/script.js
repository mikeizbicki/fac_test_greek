document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('item-container');
    const itemType = container.dataset.itemType;
    const itemName = container.dataset.itemName;

    // Handle JSON editing
    document.querySelectorAll('.json-section').forEach(section => {
        const filename = section.dataset.filename;
        const jsonDisplay = section.querySelector('.json-display');
        const jsonEdit = section.querySelector('.json-edit');
        const jsonTextarea = section.querySelector('.json-textarea');
        const saveButton = section.querySelector('.save-button');
        const cancelButton = section.querySelector('.cancel-button');

        // Enter edit mode on double-click
        jsonDisplay.addEventListener('dblclick', function() {
            enterEditMode();
        });

        // Enter edit mode on click (like the book frames)
        jsonDisplay.addEventListener('click', function() {
            enterEditMode();
        });

        // Cancel editing on Escape key
        jsonTextarea.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                exitEditMode();
            }
        });

        // Save button
        saveButton.addEventListener('click', function() {
            saveJsonFile(filename, jsonTextarea.value);
        });

        // Cancel button
        cancelButton.addEventListener('click', function() {
            exitEditMode();
        });

        function enterEditMode() {
            jsonDisplay.style.display = 'none';
            jsonEdit.style.display = 'block';
            jsonTextarea.focus();
        }

        function exitEditMode() {
            jsonDisplay.style.display = 'block';
            jsonEdit.style.display = 'none';
        }

        function saveJsonFile(filename, content) {
            fetch(`/${itemType}s/${itemName}/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filename: filename,
                    content: content
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Update the display with the new content
                    jsonDisplay.textContent = content;
                    exitEditMode();
                } else {
                    alert('Error saving: ' + data.error);
                }
            })
            .catch(error => {
                alert('Error: ' + error);
            });
        }
    });
});

