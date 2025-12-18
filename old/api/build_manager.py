from flask import Blueprint, jsonify, request
import subprocess
import os

build_api = Blueprint('build_api', __name__)

@build_api.route('/trigger/<target>', methods=['POST'])
def trigger_build(target):
    """Trigger a fac build for a specific target"""
    try:
        # Run fac build command
        result = subprocess.run(['fac', target], 
                              capture_output=True, 
                              text=True, 
                              timeout=30)
        
        return jsonify({
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        })
    
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'Build timeout'
        }), 500
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@build_api.route('/status/<target>')
def build_status(target):
    """Get build status for a target"""
    # Check if target file exists and get modification time
    possible_paths = [
        f"build/{target}",
        f"build/{target}.txt",
        f"build/{target}.md",
        f"build/{target}.json"
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            stat = os.stat(path)
            return jsonify({
                'exists': True,
                'path': path,
                'modified': stat.st_mtime,
                'size': stat.st_size
            })
    
    return jsonify({'exists': False})

