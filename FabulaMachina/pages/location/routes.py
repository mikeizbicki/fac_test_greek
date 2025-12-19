"""
Location management routes.
Handles viewing and editing location data including reference images and JSON files.
"""

from flask import Blueprint, render_template, abort, request, jsonify, send_file
import json
import os
import shutil
from routes.git_history import commit_changes_to_git

bp = Blueprint('locations', __name__, template_folder='.')

@bp.route('/locations/<location_name>')
def view_location(location_name):
    """View a location's details."""
    location_path = os.path.join('locations', location_name)
    
    if not os.path.exists(location_path):
        abort(404)
    
    # Check for required files
    about_path = os.path.join(location_path, 'about.json')
    if not os.path.exists(about_path):
        abort(404)
    
    # Prepare file data
    files = []
    
    # Reference image
    reference_path = os.path.join(location_path, 'reference.png')
    if os.path.exists(reference_path):
        files.append({
            'name': 'reference.png',
            'type': 'image',
            'title': 'Reference Image',
            'path': f'/locations/{location_name}/reference.png',
            'fac_target': f'locations/{location_name}/reference.png'
        })
    
    # About JSON
    with open(about_path, 'r', encoding='utf-8') as f:
        about_content = f.read()
    
    files.append({
        'name': 'about.json',
        'type': 'json',
        'title': 'About',
        'content': about_content,
        'path': f'/locations/{location_name}/about.json'
    })
    
    breadcrumbs = [
        {'title': 'Home', 'url': '/'},
        {'title': 'Locations', 'url': '/#locations'},
        {'title': location_name.replace('_', ' ').title(), 'url': None}
    ]
    
    return render_template('template.html',
                         item_type='location',
                         item_name=location_name,
                         item_title=location_name.replace('_', ' ').title(),
                         files=files,
                         breadcrumbs=breadcrumbs)

@bp.route('/locations/<location_name>/<filename>')
def serve_location_file(location_name, filename):
    """Serve location assets."""
    file_path = os.path.join('locations', location_name, filename)
    if os.path.exists(file_path):
        return send_file(file_path)
    else:
        abort(404)

@bp.route('/locations/<location_name>/save', methods=['POST'])
def save_location_file(location_name):
    """Save location JSON file."""
    location_path = os.path.join('locations', location_name)
    
    if not os.path.exists(location_path):
        abort(404)
    
    data = request.get_json()
    filename = data.get('filename')
    content = data.get('content')
    
    if not filename or not filename.endswith('.json'):
        return jsonify({'success': False, 'error': 'Invalid filename'}), 400
    
    file_path = os.path.join(location_path, filename)
    
    try:
        # Validate JSON
        json.loads(content)
        
        # Atomic write
        temp_path = file_path + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as f:
            f.write(content)
        shutil.move(temp_path, file_path)
        
        # Commit to git
        commit_message = f"[human] edit {filename} for location {location_name}"
        commit_changes_to_git([file_path], commit_message)
        
        return jsonify({'success': True})
        
    except json.JSONDecodeError as e:
        return jsonify({'success': False, 'error': f'Invalid JSON: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

