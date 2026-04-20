from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DEEPSEEK_API_KEY: Optional[str] = None
    DEEPSEEK_API_URL: str = "https://api.deepseek.com/v1/chat/completions"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
