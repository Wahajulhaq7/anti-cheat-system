# backend/auth.py
from fastapi import APIRouter, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from .database import get_db
from .models import UserCreate, UserLogin, UserUpdate
from .utils import hash_password, verify_password, create_access_token
import os
from jose import jwt, JWTError

# ✅ Ensure router uses correct prefix
router = APIRouter(prefix="", tags=["Auth"])  # Remove "/auth" here to avoid double prefix

security = HTTPBearer()

SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-here-change-in-production")
ALGORITHM = "HS256"


async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        role = payload.get("role")

        if not username or not role:
            raise HTTPException(status_code=401, detail="Invalid token")

        valid_roles = ['admin', 'student', 'invigilator']
        if role.lower() not in valid_roles:
            raise HTTPException(status_code=403, detail="Unauthorized role")

        return {"username": username, "role": role.lower()}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ✅ POST /auth/login
@router.post("/login")
async def login(data: UserLogin, db: Session = Depends(get_db)):
    print(f"🔍 Login attempt: {data.username}")

    result = db.execute(
        text("SELECT id, username, password_hash, role FROM Users WHERE username = :username"),
        {"username": data.username}
    ).fetchone()

    if not result or not verify_password(data.password, result.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    role_lower = result.role.strip().lower()
    if role_lower not in ['admin', 'student', 'invigilator']:
        raise HTTPException(status_code=403, detail="Invalid role")

    token = create_access_token({
        "sub": result.username,
        "id": result.id,
        "role": role_lower
    })

    print(f"✅ Login success: {result.username} ({role_lower})")
    return {
        "access_token": token,
        "token_type": "bearer",
        "id": result.id,
        "role": role_lower
    }


# ✅ POST /register
@router.post("/register")
async def register(user: UserCreate, db: Session = Depends(get_db)):
    role = user.role.strip().lower()
    if role not in ['admin', 'student', 'invigilator']:
        raise HTTPException(status_code=400, detail="Invalid role")

    if db.execute(
        text("SELECT 1 FROM Users WHERE username = :username"),
        {"username": user.username}
    ).scalar():
        raise HTTPException(status_code=400, detail="Username already exists")

    try:
        hashed = hash_password(user.password)
    except Exception:
        raise HTTPException(status_code=500, detail="Hashing failed")

    result = db.execute(
        text("""
            INSERT INTO Users (username, password_hash, role, created_at)
            OUTPUT INSERTED.id
            VALUES (:username, :password_hash, :role, GETDATE())
        """),
        {"username": user.username, "password_hash": hashed, "role": role}
    )
    new_id = result.scalar()
    db.commit()

    return {"id": new_id, "username": user.username, "role": role}


# ✅ GET /users
@router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    users = db.execute(text("SELECT id, username, role FROM Users")).fetchall()
    return [{"id": u.id, "username": u.username, "role": u.role} for u in users]


# ✅ PUT /users/{user_id}
@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    user: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    updates = {}
    if user.username:
        if db.execute(
            text("SELECT 1 FROM Users WHERE username = :username AND id != :id"),
            {"username": user.username, "id": user_id}
        ).scalar():
            raise HTTPException(status_code=400, detail="Username taken")
        updates["username"] = user.username

    if user.password:
        updates["password_hash"] = hash_password(user.password)

    if user.role:
        role = user.role.strip().lower()
        if role not in ['admin', 'student', 'invigilator']:
            raise HTTPException(status_code=400, detail="Invalid role")
        updates["role"] = role

    if not updates:
        return {"message": "No changes"}

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    db.execute(
        text(f"UPDATE Users SET {set_clause} WHERE id = :user_id"),
        {**updates, "user_id": user_id}
    )
    db.commit()
    return {"message": "Updated"}


# ✅ DELETE /users/{user_id}
@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    user = db.execute(
        text("SELECT role FROM Users WHERE id = :id"),
        {"id": user_id}
    ).fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role == 'admin':
        count = db.execute(text("SELECT COUNT(*) FROM Users WHERE role = 'admin'")).scalar()
        if count <= 1:
            raise HTTPException(status_code=400, detail="Can't delete last admin")

    db.execute(text("DELETE FROM Users WHERE id = :id"), {"id": user_id})
    db.commit()
    return {"message": "Deleted"}