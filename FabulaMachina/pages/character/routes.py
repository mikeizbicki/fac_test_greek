"""
Character management routes.
Handles viewing and editing character data including character sheets and JSON files.
"""

from flask import Blueprint, render_template, abort, request, jsonify, send_file
import json
import os
import shutil
from routes.git_history import commit_changes_to_git

bp = Blueprint('characters', __name__, template_folder='.')

@bp.route('/characters/<character_name>')
def view_character(character_name):
    """View a character's details."""
    character_path = os.path.join('characters', character_name)

    print(f"DEBUG: Checking character path: {character_path}")
    print(f"DEBUG: Path exists: {os.path.exists(character_path)}")

    if not os.path.exists(character_path):
        abort(404)

    # Check for required files
    about_path = os.path.join(character_path, 'about.json')
    print(f"DEBUG: Checking about.json at: {about_path}")
    print(f"DEBUG: about.json exists: {os.path.exists(about_path)}")

    if not os.path.exists(about_path):
        abort(404)

    # Prepare file data
    files = []

    # Character sheet image
    character_sheet_path = os.path.join(character_path, 'character_sheet.png')
    print(f"DEBUG: Checking character_sheet.png at: {character_sheet_path}")
    print(f"DEBUG: character_sheet.png exists: {os.path.exists(character_sheet_path)}")

    if os.path.exists(character_sheet_path):
        files.append({
            'name': 'character_sheet.png',
            'type': 'image',
            'title': 'Character Sheet',
            'path': f'/characters/{character_name}/character_sheet.png',
            'fac_target': f'characters/{character_name}/character_sheet.png'
        })

    # JSON files
    for json_file in ['about.json', 'voice.json']:
        json_path = os.path.join(character_path, json_file)
        print(f"DEBUG: Checking {json_file} at: {json_path}")
        print(f"DEBUG: {json_file} exists: {os.path.exists(json_path)}")

        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                files.append({
                    'name': json_file,
                    'type': 'json',
                    'title': json_file.replace('.json', '').replace('_', ' ').title(),
                    'content': content,
                    'path': f'/characters/{character_name}/{json_file}'
                })
                print(f"DEBUG: Successfully loaded {json_file}")
            except Exception as e:
                print(f"DEBUG: Error loading {json_file}: {e}")

    print(f"DEBUG: Total files found: {len(files)}")
    for file in files:
        print(f"DEBUG: File: {file['name']} ({file['type']})")

    breadcrumbs = [
        {'title': 'Home', 'url': '/'},
        {'title': 'Characters', 'url': '/#characters'},
        {'title': character_name.replace('_', ' ').title(), 'url': None}
    ]

    return render_template('character.html',
                         item_type='character',
                         item_name=character_name,
                         item_title=character_name.replace('_', ' ').title(),
                         files=files,
                         breadcrumbs=breadcrumbs)

@bp.route('/characters/<character_name>/<filename>')
def serve_character_file(character_name, filename):
    """Serve character assets."""
    file_path = os.path.join('characters', character_name, filename)
    if os.path.exists(file_path):
        return send_file('../' + file_path)
    else:
        abort(404)

@bp.route('/characters/<character_name>/save', methods=['POST'])
def save_character_file(character_name):
    """Save character JSON file."""
    character_path = os.path.join('characters', character_name)

    if not os.path.exists(character_path):
        abort(404)

    data = request.get_json()
    filename = data.get('filename')
    content = data.get('content')

    if not filename or not filename.endswith('.json'):
        return jsonify({'success': False, 'error': 'Invalid filename'}), 400

    file_path = os.path.join(character_path, filename)

    try:
        # Validate JSON
        json.loads(content)

        # Atomic write
        temp_path = file_path + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as f:
            f.write(content)
        shutil.move(temp_path, file_path)

        # Commit to git
        commit_message = f"[human] edit {filename} for character {character_name}"
        commit_changes_to_git([file_path], commit_message)

        return jsonify({'success': True})

    except json.JSONDecodeError as e:
        return jsonify({'success': False, 'error': f'Invalid JSON: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

