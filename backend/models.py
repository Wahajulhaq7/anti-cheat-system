# backend/models.py
from pydantic import BaseModel, ConfigDict, Field, validator
from typing import Optional

# -------------------------------
# User Models
# -------------------------------

class UserBase(BaseModel):
    """
    Base model for user data.
    """
    username: str = Field(..., min_length=3, max_length=50, description="Username (3-50 characters)")


# backend/models.py


class UserCreate(BaseModel):
    username: str
    password: str
    role: str
# backend/models.py
from pydantic import BaseModel

class UserLogin(BaseModel):
    username: str
    password: str

class UserUpdate(BaseModel):
    """
    Model for updating user fields (all optional).
    """
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    password: Optional[str] = Field(None, min_length=6)
    role: Optional[str] = Field(None, pattern='^(student|admin|invigilator)$')


class Token(BaseModel):
    """
    Model for JWT token response.
    """
    access_token: str
    token_type: str
    id: int
    role: str


# -------------------------------
# Exam Models
# -------------------------------

class ExamCreate(BaseModel):
    """
    Model for creating a new exam.
    """
    title: str = Field(..., min_length=1, max_length=100, description="Exam title")


# -------------------------------
# Question Models
# -------------------------------

class MCQCreate(BaseModel):
    """
    Model for creating a multiple-choice question.
    """
    exam_id: int
    question: str = Field(..., min_length=1, max_length=500, description="Question text")
    options: str = Field(
        ...,
        description="JSON string of options, e.g. {\"A\": \"Option A\", \"B\": \"Option B\"}"
    )
    correct_option: str = Field(
        ...,
        pattern='^[A-D]$',  # Example: A, B, C, D
        description="Correct option key (e.g., 'A')"
    )


# Optional: Add a response model for user output
# backend/models.py
from pydantic import BaseModel

class UserResponse(BaseModel):
    id: int
    username: str
    role: str

    model_config = ConfigDict(from_attributes=True)