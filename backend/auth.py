# backend/auth.py
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import UserCreate, UserLogin
from backend.utils import hash_password, verify_password, create_access_token

print("✅ Auth module loaded!")

router = APIRouter(prefix="/auth", tags=["Auth"])


# --- Login ---
@router.post("/login")
def login(data: UserLogin):
    query = text("SELECT id, password_hash, role FROM Users WHERE username = :username")
    with get_db().bind.connect() as conn:
        result = conn.execute(query, {"username": data.username}).fetchone()

    if not result or not verify_password(data.password, result.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({
        "sub": data.username,
        "id": result.id,
        "role": result.role
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "id": result.id,
        "role": result.role
    }


# --- Register ---
@router.post("/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    if user.role not in ['student', 'admin']:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'student' or 'admin'.")

    # Check if username exists
    check = text("SELECT 1 FROM Users WHERE username = :username")
    if db.execute(check, {"username": user.username}).fetchone():
        raise HTTPException(status_code=400, detail="Username already exists.")

    hashed_password = hash_password(user.password)
    query = text("""
        INSERT INTO Users (username, password_hash, role)
        VALUES (:username, :password_hash, :role)
    """)

    try:
        db.execute(query, {
            "username": user.username,
            "password_hash": hashed_password,
            "role": user.role
        })
        db.commit()
        return {"msg": f"User '{user.username}' created successfully!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create user")


# --- Get All Users ---
# backend/auth.py

@router.get("/users")
def get_users(db: Session = Depends(get_db)):
    query = text("SELECT id, username, role FROM Users")
    result = db.execute(query).fetchall()
    
    # Log what's being sent to the frontend
    print("Sending users:", result)
    
    return [{"id": r.id, "username": r.username, "role": r.role} for r in result]

# --- Update User ---
@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    username: str = None,
    password: str = None,
    role: str = None,
    db: Session = Depends(get_db)
):
    # 🔍 Check if user exists
    query = text("SELECT username, password_hash, role FROM Users WHERE id = :id")
    result = db.execute(query, {"id": user_id}).fetchone()
    if not result:
        raise HTTPException(status_code=404, detail="User not found")

    # ✅ Only update username if explicitly provided (even if empty)
    new_username = username if username is not None else result.username

    # Prevent duplicate username
    if new_username != result.username:
        check = text("SELECT 1 FROM Users WHERE username = :username AND id != :id")
        if db.execute(check, {"username": new_username, "id": user_id}).fetchone():
            raise HTTPException(status_code=400, detail="Username already exists")

    # Hash password if provided
    new_password_hash = hash_password(password) if password else result.password_hash

    # Only update role if provided
    new_role = role if role is not None else result.role

    # 🔧 Log actual values going to DB
    print(f"🎯 Updating user {user_id}:")
    print(f"   - Username: {result.username} → {new_username}")
    print(f"   - Role: {result.role} → {new_role}")

    # ✅ Update user
    update = text("""
        UPDATE Users 
        SET username = :username, 
            password_hash = :password_hash, 
            role = :role
        WHERE id = :id
    """)
    db.execute(update, {
        "id": user_id,
        "username": new_username,
        "password_hash": new_password_hash,
        "role": new_role
    })
    db.commit()

    return {"msg": "User updated"}


# --- Delete User ---
@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    try:
        # 🔍 Check if user exists
        user = db.execute(text("SELECT id FROM Users WHERE id = :id"), {"id": user_id}).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # ✅ List of related tables
        related_tables = [
            "ScreenLogs",
            "Movements",
            "ExamResults",
            "UserExams",
            "Logs",
            "VideoFeed"
        ]

        # 🧹 Delete from related tables
        for table in related_tables:
            try:
                db.execute(text(f"DELETE FROM {table} WHERE user_id = :id"), {"id": user_id})
                print(f"✅ Cleared {table} for user {user_id}")
            except Exception as e:
                print(f"⚠️  Failed to clear {table}: {str(e)}")

        # ✅ Delete user
        result = db.execute(text("DELETE FROM Users WHERE id = :id"), {"id": user_id})
        db.commit()

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")

        return {"msg": "User and all related data deleted successfully"}

    except Exception as e:
        db.rollback()
        print("❌ Delete failed:", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete user: {str(e)}"
        )