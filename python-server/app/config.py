from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_path: str = ""
    database_url: str = ""
    ai_provider: str = "gemini"
    gemini_api_key: str = ""
    groq_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    groq_model: str = "openai/gpt-oss-20b"
    tavily_api_key: str = ""
    openweather_api_key: str = ""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    password_reset_secret: str = ""
    secure_cookies: bool = False
    cors_origins: str = "http://localhost:8080,http://192.168.1.80:8080,http://localhost:5000,https://direct-travel-web.onrender.com"

    @property
    def selected_provider(self) -> str:
        value = self.ai_provider.lower().strip()
        if value not in {"groq", "gemini"}:
            raise ValueError("AI_PROVIDER must be either 'groq' or 'gemini'.")
        return value

    @property
    def selected_ai(self) -> tuple[str, str, str]:
        if self.selected_provider == "groq":
            return self.groq_api_key, "https://api.groq.com/openai/v1", "openai/gpt-oss-20b"
        return self.gemini_api_key, "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-3.6-flash"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
