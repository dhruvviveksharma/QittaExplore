"""JWT authentication helpers and Flask route decorators."""

import functools
import os
from datetime import datetime, timedelta

import bcrypt
from flask import g, jsonify, request
from jose import JWTError, jwt

_SECRET = os.environ.get("JWT_SECRET", "")
if not _SECRET or _SECRET == "change-me-in-production":
    raise RuntimeError(
        "JWT_SECRET environment variable must be set to a secure random value. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )
_ALGO = "HS256"
_TTL = timedelta(days=7)


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def check_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_token(user_id: str, username: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.utcnow() + _TTL,
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _SECRET, algorithms=[_ALGO])


# ---------------------------------------------------------------------------
# Flask decorators
# ---------------------------------------------------------------------------

def require_auth(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "Missing or malformed Authorization header"}), 401
        token = header.split(" ", 1)[1]
        try:
            payload = decode_token(token)
        except JWTError:
            return jsonify({"error": "Invalid or expired token"}), 401
        g.user_id = payload["sub"]
        g.username = payload["username"]
        g.user_role = payload["role"]
        return f(*args, **kwargs)
    return wrapper


def require_admin(f):
    @require_auth
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if g.user_role != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return wrapper
