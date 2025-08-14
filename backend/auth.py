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

# ✅ Router: No prefix here (handled in main.py)
router = APIRouter(tags=["Auth"])

security = HTTPBearer()

SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-here-change-in-production")
ALGORITHM = "HS256"


# Dependency: Get current user from JWT
async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        role = payload.get("role")

        if not username or not role:
            raise HTTPException(status_code=401, detail="Invalid token: missing claims")

        valid_roles = ['admin', 'student', 'invigilator']
        role_lower = role.lower().strip()

        if role_lower not in valid_roles:
            raise HTTPException(status_code=403, detail="Unauthorized role")

        return {"username": username, "role": role_lower}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# Dependency: Admin can see all users, invigilator only students
async def get_admin_or_invigilator(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "invigilator"]:
        raise HTTPException(
            status_code=403,
            detail="Access denied: Only admins and invigilators can view users"
        )
    return current_user


# ✅ POST /login
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


# ✅ GET /users - Admin sees all users, Invigilator sees only students
@router.get("/users", dependencies=[Depends(get_admin_or_invigilator)])
async def get_users(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Returns:
    - All users if current user is admin
    - Only students if current user is invigilator
    """
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


# ✅ PUT /users/{user_id} - Admin only
@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    user: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update users")

    # Fetch existing user
    query = text("SELECT username, role FROM Users WHERE id = :id")
    result = db.execute(query, {"id": user_id}).fetchone()
    if not result:
        raise HTTPException(status_code=404, detail="User not found")

    updates = {}
    if user.username:
        check = text("SELECT 1 FROM Users WHERE username = :username AND id != :id")
        if db.execute(check, {"username": user.username, "id": user_id}).scalar():
            raise HTTPException(status_code=400, detail="Username already exists")
        updates["username"] = user.username

    if user.password:
        updates["password_hash"] = hash_password(user.password)

    if user.role:
        role = user.role.strip().lower()
        if role not in ['admin', 'student', 'invigilator']:
            raise HTTPException(status_code=400, detail="Invalid role")
        updates["role"] = role

    if not updates:
        return {"message": "No changes to apply"}

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    update_query = text(f"UPDATE Users SET {set_clause} WHERE id = :user_id")
    db.execute(update_query, {**updates, "user_id": user_id})
    db.commit()

    return {"message": "User updated successfully"}


# ✅ DELETE /users/{user_id} - Admin only
@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete users")

    # Check if user exists
    query = text("SELECT role FROM Users WHERE id = :id")
    user = db.execute(query, {"id": user_id}).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent deleting the last admin
    if user.role == 'admin':
        admin_count = db.execute(text("SELECT COUNT(*) FROM Users WHERE role = 'admin'")).scalar()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin user")

    # Delete the user
    delete_query = text("DELETE FROM Users WHERE id = :id")
    db.execute(delete_query, {"id": user_id})
    db.commit()

    return {"message": "User deleted successfully"}