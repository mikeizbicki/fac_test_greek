#!/usr/bin/env python3
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
app.static_folder = 'static'
app.static_url_path = '/static'

import routes.api
app.register_blueprint(routes.api.bp)

import routes.auto_updater
app.register_blueprint(routes.auto_updater.bp)

import pages.book.routes
app.register_blueprint(pages.book.routes.bp)

import routes.fac
app.register_blueprint(routes.fac.bp)

if __name__ == '__main__':
    app.run(debug=True)
