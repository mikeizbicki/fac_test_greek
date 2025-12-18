from flask import Flask, render_template, jsonify, request
from api.fac_interface import fac_api
from api.build_manager import build_api
from utils.fac_parser import get_available_scopes
import os

app = Flask(__name__)

# Register API blueprints
app.register_blueprint(fac_api, url_prefix='/api')
app.register_blueprint(build_api, url_prefix='/api/build')

@app.route('/')
def index():
    scopes = get_available_scopes()
    return render_template('index.html', scopes=scopes)

@app.route('/<scope>/')
@app.route('/<scope>/<target>')
def scope_view(scope, target=None):
    # Verify scope exists
    scopes = get_available_scopes()
    if scope not in scopes:
        return "Scope not found", 404
    
    return render_template('scope.html', scope=scope, target=target)

if __name__ == '__main__':
    app.run(debug=True)

