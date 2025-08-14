# backend/models.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, relationship
from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional
from datetime import datetime

Base = declarative_base()

# -------------------------------
# SQLAlchemy ORM Models (for DB)
# -------------------------------

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # student, admin, invigilator
    created_at = Column(DateTime, default=datetime.utcnow)

class Exam(Base):
    __tablename__ = "exams"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False)
    description = Column(Text)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship
    questions = relationship("Question", back_populates="exam", cascade="all, delete-orphan")

class Question(Base):
    __tablename__ = "questions"
    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    options = Column(Text, nullable=False)  # Store as JSON string
    correct_option = Column(String(1), nullable=False)  # A, B, C, D

    # Relationship
    exam = relationship("Exam", back_populates="questions")

# -------------------------------
# Pydantic Models (for API)
# -------------------------------

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str
    role: str = 'student'

class UserLogin(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None

class UserResponse(UserBase):
    id: int
    role: str
    model_config = ConfigDict(from_attributes=True)

class MCQCreate(BaseModel):
    question_text: str
    options: str  # JSON string: {"A": "Option A", "B": "Option B"}
    correct_option: str  # A, B, C, D

class ExamCreate(BaseModel):
    title: str
    description: str
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    created_by: int
    mcqs: List[MCQCreate] = []

class Token(BaseModel):
    access_token: str
    token_type: str
    id: int
    role: str