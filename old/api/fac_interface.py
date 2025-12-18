from flask import Blueprint, jsonify, request, send_file
import os
import json
from utils.fac_parser import get_fac_config, get_scope_targets

fac_api = Blueprint('fac_api', __name__)

@fac_api.route('/scopes')
def get_scopes():
    """Get list of available scopes"""
    from utils.fac_parser import get_available_scopes
    return jsonify(get_available_scopes())

@fac_api.route('/scopes/<scope>/targets')
def get_targets(scope):
    """Get available targets for a scope"""
    targets = get_scope_targets(scope)
    return jsonify(targets)

@fac_api.route('/scopes/<scope>/targets/<target>')
def get_target_data(scope, target):
    """Get data for a specific target"""
    # For now, check if file exists in common locations
    possible_paths = [
        f"{target}.txt",
        f"{target}.md", 
        f"{target}.json",
        f"build/{target}.txt",
        f"build/{target}.md",
        f"build/{target}.json"
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    content = f.read()
                    
                # Try to determine content type
                if path.endswith('.json'):
                    return jsonify(json.loads(content))
                else:
                    return jsonify({
                        'content': content,
                        'type': 'text',
                        'format': path.split('.')[-1]
                    })
            except Exception as e:
                return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'Target not found'}), 404

@fac_api.route('/files/<path:filename>')
def serve_file(filename):
    """Serve multimedia files"""
    if os.path.exists(filename):
        return send_file(filename)
    
    # Try build directory
    build_path = os.path.join('build', filename)
    if os.path.exists(build_path):
        return send_file(build_path)
    
    return "File not found", 404

