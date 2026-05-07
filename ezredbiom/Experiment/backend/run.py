# backend/run.py
from flask import Flask
from flask_cors import CORS
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)
CORS(app)

_bg_executor = ThreadPoolExecutor(max_workers=4)

# Import route modules to register their @app.route decorators.
# These must come AFTER app and _bg_executor are defined.
import routes.study_routes        # noqa: F401, E402
import routes.project_routes      # noqa: F401, E402
import routes.chat_routes         # noqa: F401, E402
import routes.global_chat_routes  # noqa: F401, E402

if __name__ == '__main__':
    print("QIITA SEARCH API -- http://localhost:5001")
    app.run(debug=False, host='0.0.0.0', port=5001, use_reloader=False)
