from flask import Flask, jsonify
from flask_cors import CORS
from routes.search import search_bp

app = Flask(__name__)
CORS(app)

app.register_blueprint(search_bp, url_prefix="/api")

@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5001)