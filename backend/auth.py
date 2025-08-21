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

router = APIRouter(tags=["Auth"])
security = HTTPBearer()

SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-here-change-in-production")
ALGORITHM = "HS256"

# ✅ Dependency: Get current user from JWT
async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("id")
        username = payload.get("sub")
        role = payload.get("role")

        if not user_id or not username or not role:
            raise HTTPException(status_code=401, detail="Invalid token: missing claims")

        valid_roles = ['admin', 'student', 'invigilator']
        role_lower = role.lower().strip()
        if role_lower not in valid_roles:
            raise HTTPException(status_code=403, detail="Unauthorized role")

        # ✅ Always return a consistent dict
        return {"id": user_id, "username": username, "role": role_lower}

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# ✅ Role check dependency
async def get_admin_or_invigilator(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "invigilator"]:
        raise HTTPException(
            status_code=403,
            detail="Access denied: Only admins and invigilators can view users"
        )
    return current_user

# ✅ Login
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
    valid_roles = ['admin', 'student', 'invigilator']
    if role_lower not in valid_roles:
        raise HTTPException(status_code=403, detail="Invalid role")

    # ✅ Include ID in token
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

# ✅ Register
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

    hashed = hash_password(user.password)
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

# ✅ Get users
@router.get("/users", dependencies=[Depends(get_admin_or_invigilator)])
async def get_users(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user["role"] == "admin":
        query = text("SELECT id, username, role FROM Users ORDER BY role, username")
        result = db.execute(query).fetchall()
        users = [{"id": row.id, "username": row.username, "role": row.role} for row in result]
        print(f"✅ Admin fetched {len(users)} users")
        return users
    elif current_user["role"] == "invigilator":
        query = text("SELECT id, username, role FROM Users WHERE role = 'student' ORDER BY username")
        result = db.execute(query).fetchall()
        students = [{"id": row.id, "username": row.username, "role": row.role} for row in result]
        print(f"✅ Invigilator fetched {len(students)} students")
        return students
    else:
        raise HTTPException(status_code=403, detail="Access denied")
