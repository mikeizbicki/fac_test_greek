document.addEventListener('DOMContentLoaded', function() {
    console.log('target_collection.js DOMContentLoaded executing');

    const container = document.getElementById('item-container');
    if (!container) {
        console.error('item-container not found');
        return;
    }

    const collectionName = container.dataset.collectionName;
    const itemName = container.dataset.itemName;

    console.log('Target collection page loaded:', { collectionName, itemName });

    // Find all JSON sections
    const jsonSections = document.querySelectorAll('.json-section');
    console.log('Found JSON sections:', jsonSections.length);

    // JSON Editors storage
    const jsonEditors = {};

    // Initialize each JSON editor
    jsonSections.forEach((section, index) => {
        console.log('Processing JSON section:', index, section);

        const filename = section.dataset.filename;
        const editorContainer = section.querySelector(`#json-editor-${index + 1}`);
        const jsonDataElement = section.querySelector('.json-data');

        console.log('Section details:', {
            filename,
            hasEditorContainer: !!editorContainer,
            hasJsonData: !!jsonDataElement,
            editorId: `json-editor-${index + 1}`
        });

        if (!editorContainer) {
            console.error('No editor container found for section', index);
            return;
        }

        if (!jsonDataElement) {
            console.error('No JSON data element found for section', index);
            return;
        }

        // Clear loading message
        editorContainer.innerHTML = '<div style="padding: 20px;">Initializing editor...</div>';

        try {
            const rawData = jsonDataElement.textContent.trim();
            console.log('Raw JSON for', filename, ':', rawData.substring(0, 100) + '...');

            const jsonData = JSON.parse(rawData);
            console.log('Parsed JSON data for', filename, ':', jsonData);

            // Create simple editor without schema first
            const options = {
                mode: 'form',
                modes: ['form', 'tree', 'code'],
                onChange: function() {
                    console.log('Editor changed for', filename);
                    // Disable auto-save for now to avoid issues during testing
                }
            };

            console.log('Creating JSONEditor for', filename);
            const editor = new JSONEditor(editorContainer, options);

            console.log('Setting data in editor for', filename);
            editor.set(jsonData);

            jsonEditors[filename] = editor;
            console.log('Successfully created editor for', filename);

        } catch (error) {
            console.error('Error creating JSON editor for', filename, ':', error);
            editorContainer.innerHTML = `
                <div style="padding: 10px; background: #ffeeee; border: 1px solid #ff0000;">
                    <strong>Error:</strong> ${error.message}
                    <pre style="margin-top: 10px; font-size: 12px;">${jsonDataElement.textContent}</pre>
                </div>
            `;
        }
    });
});
