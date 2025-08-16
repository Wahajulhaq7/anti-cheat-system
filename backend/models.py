# backend/models.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, relationship
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

Base = declarative_base()

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

    mcqs = relationship("MCQ", back_populates="exam", cascade="all, delete-orphan")

class MCQ(Base):
    __tablename__ = "mcqs"
    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    option_a = Column(String(255), nullable=False)
    option_b = Column(String(255), nullable=False)
    option_c = Column(String(255), nullable=False)
    option_d = Column(String(255), nullable=False)
    correct_option = Column(String(1), nullable=False)  # A, B, C, D

    exam = relationship("Exam", back_populates="mcqs")


# ================================
# ✅ Pydantic Models (for API)
# ================================

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str
    role: str = 'student'  # Default role

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

class QuestionBase(BaseModel):
    questionNumber: int
    questionText: str
    options: List[str]
    correctAnswer: str  # A, B, C, D

class ExamCreate(BaseModel):
    title: str
    description: Optional[str] = None
    questions: List[QuestionBase]

class Token(BaseModel):
    access_token: str
    token_type: str
    id: int
    role: str