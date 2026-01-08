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
import shutil
from fastapi import File, UploadFile

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


# ✅ Admin-only dependency
async def get_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Access denied: Only admins can delete users"
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


# ✅ PUT /users/{user_id} — NEW: Add this endpoint
@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_admin)  # Only admins can update
):
    # Check if user exists
    existing = db.execute(
        text("SELECT id, username, role FROM Users WHERE id = :uid"),
        {"uid": user_id}
    ).fetchone()

    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    # Optional: Prevent updating super admin (e.g., user ID 1)
    if existing.id == 1:
        raise HTTPException(status_code=403, detail="Cannot update super admin")

    # Update fields
    updates = {}
    if user_data.username is not None:
        updates["username"] = user_data.username
    if user_data.role is not None:
        role_lower = user_data.role.strip().lower()
        if role_lower not in ['admin', 'student', 'invigilator']:
            raise HTTPException(status_code=400, detail="Invalid role")
        updates["role"] = role_lower
    if user_data.password is not None and user_data.password.strip():
        hashed = hash_password(user_data.password)
        updates["password_hash"] = hashed

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Build dynamic UPDATE query
    set_clause = ", ".join([f"{k} = :{k}" for k in updates])
    query = text(f"UPDATE Users SET {set_clause} WHERE id = :uid")
    params = {**updates, "uid": user_id}

    result = db.execute(query, params)
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found or already deleted")

    return {"message": f"User {user_id} updated successfully"}


# ✅ DELETE /users/{user_id} — NEW: Add this endpoint
@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_admin)  # Only admins can delete
):
    # Check if user exists
    existing = db.execute(
        text("SELECT id, role FROM Users WHERE id = :uid"),
        {"uid": user_id}
    ).fetchone()

    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    # Optional: Prevent deleting super admin (e.g., user ID 1)
    if existing.id == 1:
        raise HTTPException(status_code=403, detail="Cannot delete super admin")

    # Delete the user
    result = db.execute(
        text("DELETE FROM Users WHERE id = :uid"),
        {"uid": user_id}
    )
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found or already deleted")

    return {"message": f"User {user_id} deleted successfully"}
# ✅ Get a single user by ID (Admin or Invigilator only)
@router.get("/users/{user_id}", dependencies=[Depends(get_admin_or_invigilator)])
async def get_user_by_id(
    user_id: int,
    db: Session = Depends(get_db)
):
    row = db.execute(
        text("SELECT id, username, role FROM Users WHERE id = :uid"),
        {"uid": user_id}
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    return {"id": row.id, "username": row.username, "role": row.role}

# backend/auth.py

# ... (keep existing imports and code) ...

# ✅ NEW: GET TOTAL USER COUNT (ALL ROLES)
@router.get("/users/count/all")
async def get_total_user_count(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user) 
):
    """
    Returns the total number of ALL registered users (admin + student + invigilator).
    """
    # Security check: only allow admins or invigilators
    if current_user["role"] not in ["admin", "invigilator"]:
         raise HTTPException(status_code=403, detail="Not authorized")

    try:
        # Count ALL users in the table
        count = db.execute(text("SELECT COUNT(*) FROM Users")).scalar()
        return {"count": count}

    except Exception as e:
        print(f"Error counting users: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch user count")


BASE_DIR = os.path.dirname(os.path.dirname(__file__))
PROFILE_PICS_PATH = os.path.join(BASE_DIR, "uploads", "profiles")
os.makedirs(PROFILE_PICS_PATH, exist_ok=True)

@router.post("/register-face")
async def register_face(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Receives a webcam capture and saves it as the user's reference face ID.
    Filename format: {user_id}.jpg
    """
    user_id = current_user["id"]
    file_location = os.path.join(PROFILE_PICS_PATH, f"{user_id}.jpg")
    
    try:
        # Save the uploaded file overwriting any existing one
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        print(f"✅ Face registered for User {user_id} at {file_location}")
        return {"status": "success", "message": "Face registered successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save face image: {str(e)}")