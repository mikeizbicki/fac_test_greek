"""
Git History Management

Provides endpoints for fetching git commit history and managing repository state.
Integrates with the sidebar history tab to show real-time commit updates.
"""

import json
import os
import queue
import threading
import time
from flask import Blueprint, jsonify, Response, request

try:
    import git
except ImportError:
    print("GitPython not found. Install with: pip install GitPython")
    git = None

bp = Blueprint('git_history', __name__)

# Global state for git history SSE
history_clients = {}
history_lock = threading.Lock()
history_next_client_id = 1

def get_repo():
    """Get GitPython repo object for current directory"""
    if not git:
        return None
    try:
        return git.Repo(os.getcwd())
    except git.exc.InvalidGitRepositoryError:
        return None

def get_commit_history(limit=200):
    """Get git commit history as list of dicts"""
    repo = get_repo()
    if not repo:
        return []
    
    commits = []
    try:
        for commit in repo.iter_commits(max_count=limit):
            commits.append({
                'hash': commit.hexsha[:7],
                'full_hash': commit.hexsha,
                'message': commit.message.strip(),
                'author': commit.author.name,
                'date': commit.committed_date,
                'date_str': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(commit.committed_date))
            })
    except Exception as e:
        print(f"Error getting git history: {e}")
    
    return commits

def notify_history_clients(event_type, data=None):
    """Send notification to all history SSE clients"""
    with history_lock:
        if not history_clients:
            return
            
        message = {
            'type': event_type,
            'timestamp': time.time(),
            'data': data
        }
        
        dead_clients = []
        for client_id, client_queue in history_clients.items():
            try:
                client_queue.put_nowait(message)
            except queue.Full:
                dead_clients.append(client_id)
        
        # Clean up dead clients
        for client_id in dead_clients:
            del history_clients[client_id]

@bp.route('/api/git/history')
def git_history():
    """Get git commit history"""
    commits = get_commit_history()
    return jsonify({
        'success': True,
        'commits': commits
    })

@bp.route('/api/git/checkout', methods=['POST'])
def git_checkout():
    """Checkout a specific commit"""
    repo = get_repo()
    if not repo:
        return jsonify({'success': False, 'error': 'Not a git repository'}), 400
    
    data = request.get_json()
    commit_hash = data.get('commit_hash')
    
    if not commit_hash:
        return jsonify({'success': False, 'error': 'commit_hash required'}), 400
    
    try:
        repo.git.checkout(commit_hash)
        
        # Notify clients of checkout
        notify_history_clients('checkout', {
            'commit_hash': commit_hash,
            'message': f'Checked out commit {commit_hash[:7]}'
        })
        
        return jsonify({
            'success': True,
            'message': f'Checked out commit {commit_hash[:7]}'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Checkout failed: {str(e)}'
        }), 400

@bp.route('/api/git/history/events')
def git_history_events():
    """Server-Sent Events for git history updates"""
    def generate():
        global history_next_client_id
        
        with history_lock:
            client_id = f"history_client_{history_next_client_id}_{int(time.time())}"
            history_next_client_id += 1
            client_queue = queue.Queue(maxsize=100)
            history_clients[client_id] = client_queue
        
        try:
            # Send initial connection message
            yield f"data: {json.dumps({'type': 'connected', 'client_id': client_id})}\n\n"
            
            while True:
                try:
                    message = client_queue.get(timeout=30)
                    yield f"data: {json.dumps(message)}\n\n"
                except queue.Empty:
                    # Send heartbeat
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        except GeneratorExit:
            pass
        finally:
            with history_lock:
                if client_id in history_clients:
                    del history_clients[client_id]
    
    return Response(generate(), mimetype='text/event-stream')

# Hook into the FAC build system to notify when commits are made
def on_commit_created(commit_hash, message):
    """Called when a new commit is created (hook this into fac build system)"""
    notify_history_clients('new_commit', {
        'commit_hash': commit_hash,
        'message': message
    })
