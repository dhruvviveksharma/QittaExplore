# backend/run.py
import sys
from flask import Flask
from flask_cors import CORS
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)
CORS(app)

_bg_executor = ThreadPoolExecutor(max_workers=4)

# When executed as __main__, sys.modules only contains this module under
# '__main__'. Route files do `from run import app`, which would trigger a
# second import of this file unless we also register it under 'run'.
sys.modules.setdefault('run', sys.modules[__name__])

# Import route modules to register their @app.route decorators.
# These must come AFTER app and _bg_executor are defined.
import routes.study_routes        # noqa: F401, E402
import routes.project_routes      # noqa: F401, E402
import routes.chat_routes         # noqa: F401, E402
import routes.global_chat_routes  # noqa: F401, E402

if __name__ == '__main__':
    print("QIITA SEARCH API -- http://localhost:5001")
    app.run(debug=False, host='0.0.0.0', port=5001, use_reloader=False)
