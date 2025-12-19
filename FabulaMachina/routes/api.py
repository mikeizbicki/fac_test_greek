from flask import Blueprint, render_template, abort, request, jsonify, send_file
import os

bp = Blueprint('api', __name__)

@bp.route('/pages/<page>/static/<path:filename>')
def page_static(page, filename):
    return send_file(os.path.join('pages', page, 'static', filename))

@bp.route('/api/get_target/<path:target>')
def serve_target_file(target):
    """Serve any file corresponding to a fac.yaml target."""
    # Sanitize the path to prevent directory traversal attacks
    safe_target = os.path.normpath(target)
    if safe_target.startswith('..') or os.path.isabs(safe_target):
        abort(403)  # Forbidden - potential security issue

    # Make the target path relative to the working directory where flask was launched
    target_path = os.path.join(os.getcwd(), safe_target)

    if os.path.exists(target_path):
        return send_file(target_path)
    else:
        abort(404)

def discover_items(base_dir, required_files=None):
    """Generic function to discover items in a directory structure."""
    items = []

    if not os.path.exists(base_dir):
        return items

    for item_name in os.listdir(base_dir):
        item_path = os.path.join(base_dir, item_name)
        if os.path.isdir(item_path):
            # Check if required files exist (if specified)
            if required_files:
                has_all_required = all(
                    os.path.exists(os.path.join(item_path, req_file))
                    for req_file in required_files
                )
                if not has_all_required:
                    continue

            items.append({
                'name': item_name,
                'title': item_name.replace('_', ' ').title()
            })

    return sorted(items, key=lambda x: x['name'])

@bp.route('/')
def index():
    """List all available books, characters, and locations."""
    # Discover books (existing logic)
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

    # Discover characters
    characters = discover_items('characters', ['about.json'])

    # Discover locations
    locations = discover_items('locations', ['about.json'])

    return render_template('index.html',
                         books=books,
                         characters=characters,
                         locations=locations)

