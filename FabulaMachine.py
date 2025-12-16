#!/usr/bin/env python3
"""
Flask app for viewing framed fountain scripts.

Serves framed fountain files from books/$LEVEL/$BOOK/script.fountain.framed
and renders them using screenplain with frame organization.

====

This app uses a new frame-enhanced version of the fountain file format.

MOTIVATION:
When working with screenplays, it's often useful to break the script into small,
manageable chunks (frames) of action/dialogue that represent roughly 10 seconds
of screen time each. This allows for:

1. Better organization and analysis of screenplay structure
2. Easier collaboration and review of specific script segments
3. Frame-by-frame editing and revision workflows
4. Integration with storyboarding and pre-production planning tools

FRAMED FOUNTAIN FORMAT:
This script introduces a simple XML-like syntax that extends standard fountain
format by wrapping content in <frame> tags:

    <frame id="opening_scene">
    FADE IN:

    EXT. PARK - DAY

    JOHN walks his dog.
    </frame>

    <frame id="first_dialogue">
    JOHN
    Good morning, Rex.

    The dog barks.
    </frame>

RENDERING APPROACH:
Rather than reimplementing fountain-to-HTML conversion, this script leverages
the existing screenplain library's robust rendering engine. Each frame's
fountain content is individually processed by screenplain, then wrapped in
HTML div elements with frame IDs for styling and JavaScript manipulation.

The output maintains all of screenplain's formatting quality while adding
frame-level organization that enables advanced workflow tools and analysis.
"""

from io import StringIO
import json
import os
import re
import shutil
import tempfile

from flask import Flask, render_template, abort, request, jsonify, send_file
from screenplain.parsers import fountain
from screenplain.export.html import convert

app = Flask(__name__)

@app.route('/books/<level>/<book>/delete_frame', methods=['POST'])
def delete_frame(level, book):
    """Delete a frame from both fountain and JSON files."""
    script_path = os.path.join('books', level, book, 'script.fountain.framed')

    if not os.path.exists(script_path):
        abort(404)

    data = request.get_json()
    frame_id = data.get('frame_id')

    try:
        # Delete from fountain file
        with open(script_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Remove the frame block completely
        pattern = f'<frame\\s+id="{re.escape(frame_id)}".*?</frame>'
        updated_content = re.sub(pattern, '', content, flags=re.DOTALL)

        # Clean up extra whitespace
        updated_content = re.sub(r'\n{3,}', '\n\n', updated_content)

        # Atomic write
        temp_path = script_path + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        shutil.move(temp_path, script_path)

        # Delete from JSON file if it exists
        content_path = os.path.join('books', level, book, 'content.json')
        if os.path.exists(content_path):
            with open(content_path, 'r', encoding='utf-8') as f:
                json_data = json.load(f)

            # Remove the frame from the frames array
            json_data['frames'] = [f for f in json_data['frames'] if f['frame_id'] != frame_id]

            # Atomic write
            temp_path = content_path + '.tmp'
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, indent=2, ensure_ascii=False)
            shutil.move(temp_path, content_path)

        # Delete frame assets directory if it exists
        frame_dir = os.path.join('books', level, book, 'frames', frame_id)
        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/books/<level>/<book>/add_frame', methods=['POST'])
def add_frame(level, book):
    """Add a new empty frame after the specified frame."""
    script_path = os.path.join('books', level, book, 'script.fountain.framed')

    if not os.path.exists(script_path):
        abort(404)

    data = request.get_json()
    new_frame_id = data.get('frame_id')
    after_frame_id = data.get('after_frame')

    try:
        # Add to fountain file
        with open(script_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Find the position after the specified frame
        if after_frame_id:
            new_frame_content = '*insert new frame content here*'
            pattern = f'(<frame\\s+id="{re.escape(after_frame_id)}".*?</frame>)'
            replacement = f'\\1\n\n<frame id="{new_frame_id}">\n{new_frame_content}\n</frame>'
            updated_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
        else:
            # If no after_frame specified, add at the end
            updated_content = content + f'\n\n<frame id="{new_frame_id}">\n{new_frame_content}\n</frame>'

        # Atomic write
        temp_path = script_path + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        shutil.move(temp_path, script_path)

        # Add to JSON file if it exists
        content_path = os.path.join('books', level, book, 'content.json')
        if os.path.exists(content_path):
            with open(content_path, 'r', encoding='utf-8') as f:
                json_data = json.load(f)

            # Create new frame JSON entry
            new_frame_json = {
                "frame_id": new_frame_id,
                "title": "New Scene",
                "description": "New scene description",
                "characters": [],
                "location": "New Location",
                "time_of_day": "day"
            }

            # Find position to insert
            if after_frame_id:
                insert_index = next((i + 1 for i, f in enumerate(json_data['frames'])
                                   if f['frame_id'] == after_frame_id), len(json_data['frames']))
            else:
                insert_index = len(json_data['frames'])

            json_data['frames'].insert(insert_index, new_frame_json)

            # Atomic write
            temp_path = content_path + '.tmp'
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, indent=2, ensure_ascii=False)
            shutil.move(temp_path, content_path)

        # Create frame assets directory
        frame_dir = os.path.join('books', level, book, 'frames', new_frame_id)
        os.makedirs(frame_dir, exist_ok=True)

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/books/<level>/<book>/merge_frames', methods=['POST'])
def merge_frames(level, book):
    """Merge two consecutive frames."""
    script_path = os.path.join('books', level, book, 'script.fountain.framed')

    if not os.path.exists(script_path):
        abort(404)

    data = request.get_json()
    frame_id = data.get('frame_id')
    next_frame_id = data.get('next_frame_id')

    try:
        # Read fountain file
        with open(script_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extract content from both frames
        frame_pattern = r'<frame\s+id="([^"]+)">(.*?)</frame>'
        frames = dict(re.findall(frame_pattern, content, re.DOTALL))

        if frame_id not in frames or next_frame_id not in frames:
            return jsonify({'success': False, 'error': 'One or both frames not found'}), 400

        # Merge the content
        merged_content = frames[frame_id].strip() + '\n\n' + frames[next_frame_id].strip()

        # Replace first frame with merged content
        pattern = f'(<frame\\s+id="{re.escape(frame_id)}")(.*?)(</frame>)'
        replacement = f'\\1>{merged_content}\n\\3'
        updated_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

        # Remove the second frame
        pattern = f'<frame\\s+id="{re.escape(next_frame_id)}".*?</frame>'
        updated_content = re.sub(pattern, '', updated_content, flags=re.DOTALL)

        # Clean up extra whitespace
        updated_content = re.sub(r'\n{3,}', '\n\n', updated_content)

        # Atomic write
        temp_path = script_path + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        shutil.move(temp_path, script_path)

        # Merge JSON entries if they exist
        content_path = os.path.join('books', level, book, 'content.json')
        if os.path.exists(content_path):
            with open(content_path, 'r', encoding='utf-8') as f:
                json_data = json.load(f)

            # Find and merge JSON entries
            first_frame = next((f for f in json_data['frames'] if f['frame_id'] == frame_id), None)
            second_frame = next((f for f in json_data['frames'] if f['frame_id'] == next_frame_id), None)

            if first_frame and second_frame:
                # Merge descriptions
                first_frame['description'] = f"{first_frame.get('description', '')} {second_frame.get('description', '')}".strip()
                # Merge characters lists
                first_frame['characters'] = list(set(first_frame.get('characters', []) + second_frame.get('characters', [])))

            # Remove the second frame
            json_data['frames'] = [f for f in json_data['frames'] if f['frame_id'] != next_frame_id]

            # Atomic write
            temp_path = content_path + '.tmp'
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, indent=2, ensure_ascii=False)
            shutil.move(temp_path, content_path)

        # Remove the second frame's assets directory
        frame_dir = os.path.join('books', level, book, 'frames', next_frame_id)
        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/books/<level>/<book>/frames/<frame_id>/<filename>')
def serve_frame_file(level, book, frame_id, filename):
    """Serve frame assets (images and audio)."""
    file_path = os.path.join('books', level, book, 'frames', frame_id, filename)
    if os.path.exists(file_path):
        return send_file(file_path)
    else:
        abort(404)

@app.route('/books/<level>/<book>/get_frame_json/<frame_id>')
def get_frame_json(level, book, frame_id):
    """Get JSON data for a specific frame."""
    content_path = os.path.join('books', level, book, 'content.json')

    try:
        with open(content_path, 'r', encoding='utf-8') as f:
            content = json.load(f)

        frame_data = next((f for f in content['frames'] if f['frame_id'] == frame_id), None)
        if frame_data:
            return jsonify({'success': True, 'frame_data': frame_data})
        else:
            return jsonify({'success': False, 'error': 'Frame not found'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/books/<level>/<book>/save_frame', methods=['POST'])
def save_frame(level, book):
    """Save both fountain and JSON content atomically."""
    script_path = os.path.join('books', level, book, 'script.fountain.framed')

    if not os.path.exists(script_path):
        abort(404)

    data = request.get_json()
    frame_id = data.get('frame_id')
    fountain_content = data.get('fountain_content', data.get('content'))  # backward compatibility
    json_content = data.get('json_content')

    try:
        # Save fountain file
        with open(script_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Replace the specific frame content
        pattern = f'(<frame\\s+id="{re.escape(frame_id)}")(.*?)(</frame>)'
        replacement = f'\\1>{fountain_content.strip()}\n\\3'
        updated_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

        # Atomic write using temporary file
        temp_path = script_path + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        shutil.move(temp_path, script_path)

        # Save JSON file if provided
        if json_content:
            content_path = os.path.join('books', level, book, 'content.json')
            if os.path.exists(content_path):
                with open(content_path, 'r', encoding='utf-8') as f:
                    json_data = json.load(f)

                # Update the specific frame
                for i, frame in enumerate(json_data['frames']):
                    if frame['frame_id'] == frame_id:
                        json_data['frames'][i] = json.loads(json_content)
                        break

                # Atomic write
                temp_path = content_path + '.tmp'
                with open(temp_path, 'w', encoding='utf-8') as f:
                    json.dump(json_data, f, indent=2, ensure_ascii=False)
                shutil.move(temp_path, content_path)

        # Return rendered HTML for this frame
        rendered_html = render_frame_html(fountain_content)
        return jsonify({'success': True, 'html': rendered_html})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def parse_framed_fountain(content):
    """Parse the framed fountain format and extract frames."""
    frames = []
    
    # Find all frame blocks
    frame_pattern = r'<frame\s+id="([^"]+)">(.*?)</frame>'
    matches = re.findall(frame_pattern, content, re.DOTALL)
    
    for frame_id, frame_content in matches:
        frames.append({
            'id': frame_id,
            'content': frame_content.strip()
        })
    
    return frames

def render_frame_html(frame_content):
    """Convert a single frame's fountain content to HTML."""

    # NOTE:
    # screenplain always renders underscores as markdown underlines,
    # and it does not respect normal escapes like "\_".
    # Therefore, we create our own special escape code that is unlikely to conflict with anything,
    # and manually replace underscores before/after calling screenplain.
    underscore_escape = 'UNDERSCORE'*5
    frame_content = frame_content.replace('_', underscore_escape)
    start_string = 'FADE IN: \n\n\n'
    screenplay = fountain.parse(StringIO(start_string + frame_content))
    html_buffer = StringIO()
    convert(screenplay, html_buffer, bare=True)
    return html_buffer.getvalue().replace(underscore_escape, '_')[41:]

@app.route('/')
def index():
    """List all available books."""
    books = []
    books_dir = 'books'
    
    if os.path.exists(books_dir):
        for level in os.listdir(books_dir):
            level_path = os.path.join(books_dir, level)
            if os.path.isdir(level_path):
                for book in os.listdir(level_path):
                    book_path = os.path.join(level_path, book)
                    script_path = os.path.join(book_path, 'script.fountain.framed')
                    if os.path.isdir(book_path) and os.path.exists(script_path):
                        books.append({
                            'level': level,
                            'book': book,
                            'title': f"{level} - {book}"
                        })
    
    return render_template('index.html', books=books)

@app.route('/books/<level>/<book>')
def view_script(level, book):
    """View a framed fountain script."""
    script_path = os.path.join('books', level, book, 'script.fountain.framed')
    
    if not os.path.exists(script_path):
        abort(404)
    
    try:
        with open(script_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        frames = parse_framed_fountain(content)
        
        if not frames:
            return render_template('script.html', 
                                 level=level, 
                                 book=book, 
                                 frames=[], 
                                 error="No frames found in script")
        
        # Render each frame
        rendered_frames = []
        for frame in frames:
            rendered_frames.append({
                'id': frame['id'],
                'html': render_frame_html(frame['content']),
                'content': frame['content']
            })
        
        return render_template('script.html', 
                             level=level, 
                             book=book, 
                             frames=rendered_frames)
    
    except Exception as e:
        raise e
        return render_template('script.html', 
                             level=level, 
                             book=book, 
                             frames=[], 
                             error=str(e))

if __name__ == '__main__':
    app.run(debug=True)
