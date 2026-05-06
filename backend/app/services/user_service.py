"""用户管理服务 — 账户注册、登录验证、Session 管理.

开发级简化实现：
- 用户数据存 JSON 文件（data/users.json）
- Session 存 JSON 文件（data/sessions.json），持久化到磁盘
- 密码使用 SHA256 哈希（无 salt，开发级简化）
- 重启后端后 session 仍然有效
"""
from __future__ import annotations

import hashlib
import json
import secrets
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import Request, HTTPException, status

# ── Paths ──
DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"
USERS_PATH = DATA_DIR / "users.json"
SESSIONS_PATH = DATA_DIR / "sessions.json"

def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


# ── Password helpers ──

def _hash_password(password: str) -> str:
    """SHA256 哈希（开发级简化，无 salt）."""
    return "sha256:" + hashlib.sha256(password.encode("utf-8")).hexdigest()


def _verify_password(password: str, password_hash: str) -> bool:
    if not password_hash.startswith("sha256:"):
        return False
    return _hash_password(password) == password_hash


# ── JSON file helpers ──

def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _save_json(path: Path, data: Any) -> None:
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.rename(path)


# ── User Service ──

class UserService:
    """管理用户账户（users.json）."""

    def __init__(self) -> None:
        _ensure_data_dir()
        self._init_default_admin()

    def _load_users(self) -> list[dict]:
        return _load_json(USERS_PATH, [])

    def _save_users(self, users: list[dict]) -> None:
        _save_json(USERS_PATH, users)

    def _init_default_admin(self) -> None:
        """如果 users.json 不存在，创建默认 admin 账号."""
        if USERS_PATH.exists():
            return
        admin = {
            "user_id": "u_admin_default",
            "username": "admin",
            "password_hash": _hash_password("admin"),
            "role": "admin",
            "created_at": datetime.now().isoformat(),
        }
        self._save_users([admin])
        print("[UserService] Created default admin account (admin / admin)")

    def create_user(self, username: str, password: str, role: str = "user") -> dict:
        """注册新用户."""
        users = self._load_users()
        # 检查用户名唯一
        if any(u["username"] == username for u in users):
            raise ValueError(f"Username '{username}' already exists")
        user = {
            "user_id": f"u_{secrets.token_hex(6)}",
            "username": username,
            "password_hash": _hash_password(password),
            "role": role,
            "created_at": datetime.now().isoformat(),
        }
        users.append(user)
        self._save_users(users)
        # 返回时去掉密码哈希
        return {k: v for k, v in user.items() if k != "password_hash"}

    def verify_user(self, username: str, password: str) -> dict | None:
        """验证用户名密码，返回用户信息（不含密码）."""
        users = self._load_users()
        for u in users:
            if u["username"] == username and _verify_password(password, u["password_hash"]):
                return {k: v for k, v in u.items() if k != "password_hash"}
        return None

    def get_user_by_id(self, user_id: str) -> dict | None:
        users = self._load_users()
        for u in users:
            if u["user_id"] == user_id:
                return {k: v for k, v in u.items() if k != "password_hash"}
        return None

    def list_users(self) -> list[dict]:
        """返回所有用户列表（不含密码）."""
        users = self._load_users()
        return [{k: v for k, v in u.items() if k != "password_hash"} for u in users]


# ── Session Service ──

class SessionService:
    """管理登录 Session（sessions.json）."""

    SESSION_TTL_HOURS = 168  # 7 天

    def __init__(self) -> None:
        _ensure_data_dir()

    def _load_sessions(self) -> dict:
        return _load_json(SESSIONS_PATH, {})

    def _save_sessions(self, sessions: dict) -> None:
        _save_json(SESSIONS_PATH, sessions)

    def create_session(self, user_id: str) -> str:
        """创建新 session，返回 token."""
        sessions = self._load_sessions()
        token = "tkn_" + secrets.token_urlsafe(32)
        sessions[token] = {
            "user_id": user_id,
            "created_at": datetime.now().isoformat(),
        }
        self._save_sessions(sessions)
        return token

    def get_session(self, token: str) -> dict | None:
        """验证 token，返回 session 信息（含 user_id）."""
        if not token or not token.startswith("tkn_"):
            return None
        sessions = self._load_sessions()
        sess = sessions.get(token)
        if not sess:
            return None
        # 检查过期
        try:
            created = datetime.fromisoformat(sess["created_at"])
            if datetime.now() - created > timedelta(hours=self.SESSION_TTL_HOURS):
                # 过期，清理
                del sessions[token]
                self._save_sessions(sessions)
                return None
        except Exception:
            return None
        return sess

    def delete_session(self, token: str) -> None:
        """销毁 session."""
        sessions = self._load_sessions()
        if token in sessions:
            del sessions[token]
            self._save_sessions(sessions)

    def clear_expired(self) -> int:
        """清理过期 session，返回清理数量."""
        sessions = self._load_sessions()
        now = datetime.now()
        expired = [
            t for t, s in sessions.items()
            if now - datetime.fromisoformat(s["created_at"]) > timedelta(hours=self.SESSION_TTL_HOURS)
        ]
        for t in expired:
            del sessions[t]
        if expired:
            self._save_sessions(sessions)
        return len(expired)


# ── Singletons ──

_user_service: UserService | None = None
_session_service: SessionService | None = None


def get_user_service() -> UserService:
    global _user_service
    if _user_service is None:
        _user_service = UserService()
    return _user_service


def get_session_service() -> SessionService:
    global _session_service
    if _session_service is None:
        _session_service = SessionService()
    return _session_service


# ── FastAPI Dependency ──

async def get_current_user(request: Request) -> dict:
    """FastAPI 依赖：从 Cookie 读取 session_token，返回当前用户信息.

    用法：
        @router.get("/some_endpoint")
        def some_endpoint(user: dict = Depends(get_current_user)):
            ...
    """
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    sess_svc = get_session_service()
    sess = sess_svc.get_session(token)
    if not sess:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid")

    user_svc = get_user_service()
    user = user_svc.get_user_by_id(sess["user_id"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


async def get_current_admin(request: Request) -> dict:
    """FastAPI 依赖：要求当前用户必须是管理员."""
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
