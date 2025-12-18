"""
FAC BUILD SYSTEM - SERVER SIDE

This Flask blueprint provides the backend API for triggering FAC builds from the web interface.
It integrates the fac.BuildSystem library with the FabulaMachina Flask application to enable
on-demand rebuilding of individual assets (images, audio, PDFs, etc.).

ARCHITECTURE OVERVIEW:
- Exposes REST API endpoints for build management (/api/fac/build, /api/fac/build/status, etc.)
- Uses Server-Sent Events (SSE) to stream real-time build logs to clients
- Manages concurrent build prevention (only one build allowed at a time globally)
- Integrates with fac.BuildSystem for actual build execution
- Captures and forwards FAC logging output to both Flask console and web clients

INTEGRATION WITH FAC BUILD SYSTEM:
- Imports fac.BuildSystem class and related components from the installed fac package
- Runs builds in background threads to avoid blocking the Flask request thread
- Configures BuildSystem with appropriate settings (allow_dirty=True, auto_commit=False)
- Uses custom LogHandler to capture fac logs and stream them to web clients
- Handles BuildSystem exceptions and translates them to appropriate HTTP responses

THREAD SAFETY AND CONCURRENCY:
- Uses threading.Lock to protect shared state (active_builds dictionary)
- Prevents concurrent builds globally (not per-target) for system resource management
- Runs actual builds in daemon threads to avoid blocking Flask
- Manages build lifecycle: queued → running → completed/error
- Automatic cleanup of old build records after 1 hour

DATA FLOW:
1. Client sends POST /api/fac/build with target and options
2. Server creates build record and starts background thread
3. Background thread initializes BuildSystem and custom LogHandler
4. fac.BuildSystem executes build, sending logs to LogHandler
5. LogHandler queues log messages for SSE streaming
6. Client receives real-time logs via GET /api/fac/build/logs/{build_id}
7. Build completes, server sends completion/error message, client closes SSE

ERROR HANDLING:
- FACError, DirtyRepo: Treated as build failures, logged and reported to client
- Network/HTTP errors: Returned as appropriate HTTP status codes
- Unexpected exceptions: Caught and logged, build marked as error
- SSE stream errors: Handled gracefully with timeouts and heartbeats
"""

import asyncio
import json
import logging
import os
import queue
import threading
import time
import uuid
from io import StringIO

from flask import Blueprint, request, jsonify, Response

# Import the fac build system components
try:
    from fac.BuildSystem import BuildSystem, DirtyRepo, FACError
    from fac.Logging import logger as fac_logger
except ImportError as e:
    print(f"Error importing fac: {e}")
    print("Make sure fac is installed and accessible")
    raise

# Import git history notification function
try:
    from routes.git_history import notify_history_clients
except ImportError:
    # Fallback if git_history isn't available yet
    def notify_history_clients(event_type, data=None):
        pass

bp = Blueprint('fac', __name__)

# Global state for build management
# Structure: build_id -> {target, overwrite, notes, status, created_at, log_handler, error}
active_builds = {}
build_lock = threading.Lock()

# Global state for debug log streaming
debug_clients = {}
debug_lock = threading.Lock()
debug_next_client_id = 1

class DebugLogHandler(logging.Handler):
    """Log handler that captures all FAC output for the debug panel"""

    def emit(self, record):
        try:
            msg = self.format(record)

            # Send to all debug clients
            with debug_lock:
                if not debug_clients:
                    return

                log_entry = {
                    'type': 'debug_log',
                    'level': record.levelname,
                    'message': msg,
                    'timestamp': time.time()
                }

                dead_clients = []
                for client_id, client_queue in debug_clients.items():
                    try:
                        client_queue.put_nowait(log_entry)
                    except queue.Full:
                        dead_clients.append(client_id)

                # Clean up dead clients
                for client_id in dead_clients:
                    del debug_clients[client_id]

        except Exception as e:
            print(f"[Debug Log] Error: {e}")

class BuildLogHandler(logging.Handler):
    """
    Custom logging handler that captures FAC build logs and queues them for SSE streaming.

    This handler intercepts log messages from the fac.BuildSystem and makes them available
    to web clients via Server-Sent Events. It maintains a thread-safe queue of log entries
    that can be consumed by the SSE endpoint.

    Log entries are structured as dictionaries with 'type', 'level', 'message', and 'timestamp' keys.
    """

    def __init__(self, build_id):
        super().__init__()
        self.build_id = build_id
        self.log_queue = queue.Queue()

    def emit(self, record):
        """
        Called by the logging system for each log message.
        Formats the log record and adds it to the queue for SSE streaming.
        """
        try:
            msg = self.format(record)

            log_entry = {
                'type': 'log',
                'level': record.levelname,
                'message': msg,
                'timestamp': time.time()
            }
            self.log_queue.put_nowait(log_entry)
        except Exception as e:
            # Don't let logging errors break the build
            print(f"[FAC Build] Logging error: {e}")

# Add global debug handler to capture all FAC logs
debug_handler = DebugLogHandler()
fac_logger.addHandler(debug_handler)

@bp.route('/api/fac/debug/events')
def debug_events():
    """Server-Sent Events for debug log streaming"""
    def generate():
        global debug_next_client_id

        with debug_lock:
            client_id = f"debug_client_{debug_next_client_id}_{int(time.time())}"
            debug_next_client_id += 1
            client_queue = queue.Queue(maxsize=1000)  # Larger queue for debug logs
            debug_clients[client_id] = client_queue

        try:
            yield f"data: {json.dumps({'type': 'connected', 'client_id': client_id})}\n\n"

            while True:
                try:
                    message = client_queue.get(timeout=30)
                    yield f"data: {json.dumps(message)}\n\n"
                except queue.Empty:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        except GeneratorExit:
            pass
        finally:
            with debug_lock:
                if client_id in debug_clients:
                    del debug_clients[client_id]

    return Response(generate(), mimetype='text/event-stream')

@bp.route('/api/fac/debug/clear', methods=['POST'])
def clear_debug():
    """Clear debug log for all clients"""
    with debug_lock:
        clear_message = {
            'type': 'clear_debug',
            'timestamp': time.time()
        }

        for client_queue in debug_clients.values():
            try:
                client_queue.put_nowait(clear_message)
            except queue.Full:
                pass

    return jsonify({'success': True})

@bp.route('/api/fac/build', methods=['POST'])
def trigger_build():
    """
    Main endpoint for triggering FAC builds.

    Accepts JSON payload with:
    - target (required): FAC target path (e.g., "books/level1/book1/frames/frame1/art.png")
    - overwrite (optional): Boolean, whether to force rebuild even if up-to-date
    - notes (optional): String, additional context for the build (used as include_chat)

    Returns:
    - 200: Build started successfully, returns build_id for log streaming
    - 409: Another build is already in progress
    - 400: Missing or invalid request data
    """
    global active_builds

    data = request.get_json()
    if not data or 'target' not in data:
        return jsonify({'error': 'Missing target parameter'}), 400

    target = data['target']
    overwrite = data.get('overwrite', False)
    notes = data.get('notes')


    with build_lock:
        # Check if a build is already in progress
        active_build_ids = [bid for bid, info in active_builds.items()
                          if info['status'] in ['queued', 'running']]

        if active_build_ids:
            return jsonify({
                'error': 'A build is already in progress',
                'active_build_id': active_build_ids[0]
            }), 409

        # Create new build record
        build_id = str(uuid.uuid4())
        active_builds[build_id] = {
            'target': target,
            'overwrite': overwrite,
            'notes': notes,
            'status': 'queued',
            'created_at': time.time(),
            'log_handler': None
        }


    # Start build in background thread
    def run_build():
        """
        Background thread function that executes the actual FAC build.

        This function:
        1. Sets up the BuildLogHandler for log capture
        2. Configures and initializes the fac.BuildSystem
        3. Executes the build with appropriate error handling
        4. Updates build status and sends completion/error notifications
        5. Notifies git history system when commits are made
        """
        build_info = None
        log_handler = None

        try:
            with build_lock:
                if build_id not in active_builds:
                    return

                active_builds[build_id]['status'] = 'running'

                # Create and register log handler
                log_handler = BuildLogHandler(build_id)
                active_builds[build_id]['log_handler'] = log_handler

                # Send build started notification
                log_handler.log_queue.put({
                    'type': 'build_started',
                    'target': target,
                    'timestamp': time.time(),
                    'display_type': 'permanent',
                })

                build_info = active_builds[build_id]


            # Configure build system with web-friendly settings
            build_system = BuildSystem(
                project_dir=os.getcwd(),
                overwrite=overwrite,
                include_chat=notes if notes else None,
                allow_dirty=True,      # Allow builds even if git working directory is dirty
                auto_commit=True,      # Auto-commit changes (enable for git history tracking)
                print_dependencies=True,  # Show dependency information in logs
            )

            # Add our custom log handler to capture FAC logs
            fac_logger.addHandler(log_handler)

            try:

                # Execute the actual build using FAC's BuildSystem
                with build_system:
                    build_system.build_targets([target])


                # Build completed successfully
                with build_lock:
                    if build_id in active_builds:
                        active_builds[build_id]['status'] = 'completed'
                        log_handler.log_queue.put({
                            'type': 'build_completed',
                            'target': target,
                            'timestamp': time.time(),
                            'display_type': 'flash',
                        })

                # Notify git history of new commits (if any were made)
                try:
                    import git
                    repo = git.Repo(os.getcwd())
                    if repo.head.commit:
                        notify_history_clients('new_commit', {
                            'commit_hash': repo.head.commit.hexsha[:7],
                            'message': repo.head.commit.message.strip()
                        })
                except Exception as git_error:
                    print(f"Git notification error: {git_error}")

            except (FACError, DirtyRepo) as e:
                # Expected FAC build errors
                error_msg = str(e)

                with build_lock:
                    if build_id in active_builds:
                        active_builds[build_id]['status'] = 'error'
                        active_builds[build_id]['error'] = error_msg
                        log_handler.log_queue.put({
                            'type': 'build_error',
                            'target': target,
                            'error': error_msg,
                            'timestamp': time.time(),
                            'display_type': 'permanent',
                        })

            except Exception as e:
                # Unexpected errors
                error_msg = f"Unexpected error: {str(e)}"

                with build_lock:
                    if build_id in active_builds:
                        active_builds[build_id]['status'] = 'error'
                        active_builds[build_id]['error'] = error_msg
                        log_handler.log_queue.put({
                            'type': 'build_error',
                            'target': target,
                            'error': error_msg,
                            'timestamp': time.time(),
                            'display_type': 'permanent',
                        })

            finally:
                # Always clean up the log handler
                if log_handler:
                    fac_logger.removeHandler(log_handler)

        except Exception as e:
            # Handle errors in build setup/teardown
            error_msg = f"Build setup error: {str(e)}"

            with build_lock:
                if build_id in active_builds:
                    active_builds[build_id]['status'] = 'error'
                    active_builds[build_id]['error'] = error_msg

    # Start build thread as daemon (won't prevent Flask shutdown)
    build_thread = threading.Thread(target=run_build, daemon=True)
    build_thread.start()

    return jsonify({
        'build_id': build_id,
        'message': 'Build started',
        'target': target
    })

@bp.route('/api/fac/build/logs/<build_id>')
def build_logs(build_id):
    """
    Server-Sent Events endpoint for streaming real-time build logs.

    Streams log messages from the BuildLogHandler associated with the given build_id.
    Clients connect to this endpoint after triggering a build to receive:
    - Real-time log messages from the FAC build process
    - Build status updates (started, completed, error)
    - Heartbeat messages to keep the connection alive

    The stream automatically closes when the build completes or errors.
    Old build records are automatically cleaned up after 1 hour.
    """

    def generate_logs():
        """
        Generator function that yields Server-Sent Events formatted log messages.

        Continuously reads from the BuildLogHandler's queue and formats messages
        as SSE events. Handles timeouts, heartbeats, and cleanup.
        """
        build_info = active_builds.get(build_id)
        if not build_info:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Build not found'})}\n\n"
            return


        log_handler = build_info.get('log_handler')
        if not log_handler:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Log handler not available'})}\n\n"
            return

        # Send initial connection confirmation
        yield f"data: {json.dumps({'type': 'connected', 'build_id': build_id})}\n\n"

        # Stream logs until build completes
        last_heartbeat = time.time()
        while True:
            try:
                # Try to get log entry with timeout
                try:
                    log_entry = log_handler.log_queue.get(timeout=5)
                    yield f"data: {json.dumps(log_entry)}\n\n"

                    # Check if build is complete
                    if log_entry.get('type') in ['build_completed', 'build_error']:
                        break

                except queue.Empty:
                    # Send periodic heartbeat to keep connection alive
                    current_time = time.time()
                    if current_time - last_heartbeat > 30:
                        yield f"data: {json.dumps({'type': 'heartbeat', 'timestamp': current_time})}\n\n"
                        last_heartbeat = current_time

                    # Check if build record still exists
                    if build_id not in active_builds:
                        break

            except GeneratorExit:
                # Client disconnected
                break
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                break

        # Cleanup old builds (keep records for 1 hour)
        with build_lock:
            current_time = time.time()
            builds_to_remove = [
                bid for bid, info in active_builds.items()
                if current_time - info['created_at'] > 3600  # 1 hour
            ]
            for bid in builds_to_remove:
                del active_builds[bid]

    return Response(generate_logs(), mimetype='text/event-stream')

@bp.route('/api/fac/build/status/<build_id>')
def build_status(build_id):
    """
    Get the current status of a specific build.

    Returns build information including target, status, creation time, and any error messages.
    Useful for clients that need to check build status without opening an SSE stream.
    """
    build_info = active_builds.get(build_id)
    if not build_info:
        return jsonify({'error': 'Build not found'}), 404

    return jsonify({
        'build_id': build_id,
        'target': build_info['target'],
        'status': build_info['status'],
        'created_at': build_info['created_at'],
        'error': build_info.get('error')
    })

@bp.route('/api/fac/builds')
def list_builds():
    """
    List all current build records.

    Returns information about all builds currently tracked by the system.
    Useful for debugging and monitoring build activity.
    """
    with build_lock:
        builds = []
        for build_id, info in active_builds.items():
            builds.append({
                'build_id': build_id,
                'target': info['target'],
                'status': info['status'],
                'created_at': info['created_at'],
                'error': info.get('error')
            })

    return jsonify({'builds': builds})

