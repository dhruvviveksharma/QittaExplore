"""
Qiita Explorer – Flask entry point.

Blueprints registered:
  search_bp           – /api/search  (NL → SQL study search)
  projects_bp         – /api/projects  (project CRUD)
  project_studies_bp  – /api/projects/<id>/studies
  chats_bp            – /api/projects/<id>/chats  +  /api/chats/<id>
  chat_messages_bp    – /api/chats/<id>/messages
"""

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

from routes.search          import search_bp           # noqa: E402
from routes.projects        import projects_bp         # noqa: E402
from routes.project_studies import project_studies_bp  # noqa: E402
from routes.chats           import chats_bp            # noqa: E402
from routes.chat_messages   import chat_messages_bp    # noqa: E402

app.register_blueprint(search_bp,          url_prefix="/api")
app.register_blueprint(projects_bp,        url_prefix="/api")
app.register_blueprint(project_studies_bp, url_prefix="/api")
app.register_blueprint(chats_bp,           url_prefix="/api")
app.register_blueprint(chat_messages_bp,   url_prefix="/api")


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.errorhandler(404)
def not_found(_):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(_):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    print("=" * 60)
    print("  QIITA EXPLORER API  →  http://localhost:5001")
    print("=" * 60)
    app.run(debug=True, host="0.0.0.0", port=5001)