"""认证路由 — 注册、登录、登出、用户信息."""
from __future__ import annotations

from fastapi import APIRouter, Response, Request, Depends, HTTPException, status
from pydantic import BaseModel

from app.services.user_service import (
    get_user_service,
    get_session_service,
    get_current_user,
    get_current_admin,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request/Response Models ──

class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    user_id: str
    username: str
    role: str
    has_seen_tour: bool = False
    created_at: str


# ── Auth Endpoints ──

@router.post("/register", response_model=UserOut)
def register(req: RegisterRequest) -> dict:
    """用户注册."""
    if not req.username or len(req.username) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters")
    if not req.password or len(req.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    svc = get_user_service()
    try:
        user = svc.create_user(req.username, req.password, role="user")
        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
def login(req: LoginRequest, response: Response) -> dict:
    """用户登录，设置 session Cookie."""
    svc = get_user_service()
    user = svc.verify_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    sess_svc = get_session_service()
    token = sess_svc.create_session(user["user_id"])

    # 设置 httpOnly Cookie
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=False,  # 开发环境用 http
        samesite="lax",
        max_age=7 * 24 * 3600,  # 7 天
    )

    return {"status": "ok", "user": user}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict:
    """用户登出，清除 Cookie."""
    token = request.cookies.get("session_token")
    if token:
        sess_svc = get_session_service()
        sess_svc.delete_session(token)

    response.delete_cookie(key="session_token")
    return {"status": "ok"}


@router.get("/me", response_model=UserOut)
def get_me(user: dict = Depends(get_current_user)) -> dict:
    """获取当前登录用户信息."""
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(admin: dict = Depends(get_current_admin)) -> list[dict]:
    """管理员：获取所有用户列表."""
    svc = get_user_service()
    return svc.list_users()


@router.post("/tour_completed")
def mark_tour_completed(user: dict = Depends(get_current_user)) -> dict:
    """标记当前用户已完成新手教程."""
    svc = get_user_service()
    success = svc.mark_tour_completed(user["user_id"])
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "ok"}
