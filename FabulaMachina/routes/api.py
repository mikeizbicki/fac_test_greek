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


@bp.route('/')
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

