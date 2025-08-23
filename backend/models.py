# backend/models.py

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, relationship
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

Base = declarative_base()

# ================================
# ✅ SQLAlchemy ORM MODELS
# ================================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # student, admin, invigilator
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    exams_created = relationship("Exam", back_populates="creator", cascade="all, delete-orphan")
    answers = relationship("StudentAnswer", back_populates="student", cascade="all, delete-orphan")


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

    # Relationships
    creator = relationship("User", back_populates="exams_created")
    mcqs = relationship("MCQ", back_populates="exam", cascade="all, delete-orphan")
    answers = relationship("StudentAnswer", back_populates="exam", cascade="all, delete-orphan")


class MCQ(Base):
    __tablename__ = "mcqs"
    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False)
    question = Column(Text, nullable=False)   # Changed to 'question' to match API return
    option_a = Column(String(255), nullable=False)
    option_b = Column(String(255), nullable=False)
    option_c = Column(String(255), nullable=False)
    option_d = Column(String(255), nullable=False)
    correct_option = Column(String(1), nullable=False)  # A, B, C, D

    # Relationships
    exam = relationship("Exam", back_populates="mcqs")
    answers = relationship("StudentAnswer", back_populates="question_ref", cascade="all, delete-orphan")


class StudentAnswer(Base):
    __tablename__ = "studentanswers"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("mcqs.id"), nullable=False)
    selected_option = Column(String(1), nullable=True)  # A/B/C/D
    submitted_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    student = relationship("User", back_populates="answers")
    exam = relationship("Exam", back_populates="answers")
    question_ref = relationship("MCQ", back_populates="answers")


# ================================
# ✅ Pydantic Models (for API)
# ================================

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


# ✅ For submitting answers
class AnswerSubmit(BaseModel):
    question_number: int
    selected_option: Optional[str]  # A/B/C/D or None


class ExamSubmitRequest(BaseModel):
    answers: List[AnswerSubmit]
