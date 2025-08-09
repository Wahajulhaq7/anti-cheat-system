# backend/models.py
from pydantic import BaseModel

class UserCreate(BaseModel):
    username: str
    password: str
    role: str 

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class ExamCreate(BaseModel):
    title: str

class MCQCreate(BaseModel):
    exam_id: int
    question: str
    options: str
    correct_option: str