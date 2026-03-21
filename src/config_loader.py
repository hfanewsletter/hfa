import os
import yaml
from dataclasses import dataclass
from typing import List
from dotenv import load_dotenv

load_dotenv()


@dataclass
class LLMConfig:
    provider: str         # "gemini" or "openai"
    model: str            # e.g. "gemini-2.5-flash" — used for extraction & summarization
    embedding_model: str  # e.g. "gemini-embedding-exp-03-07" — used for deduplication
    api_key: str          # from env: LLM_API_KEY


@dataclass
class StorageConfig:
    provider: str        # "local", "s3", "azure", "gcs"
    inbox_path: str
    processed_path: str


@dataclass
class EmailConfig:
    sender: str
    password: str
    subscribers: List[str]
    smtp_host: str
    smtp_port: int
    send_immediately: bool
    schedule_cron: str


@dataclass
class AppConfig:
    llm: LLMConfig
    storage: StorageConfig
    email: EmailConfig
    dedup_threshold: float
    log_level: str
    log_file: str


def load_config(config_path: str = "config/config.yaml") -> AppConfig:
    with open(config_path, "r") as f:
        raw = yaml.safe_load(f)

    llm_cfg = raw["llm"]
    storage_cfg = raw["storage"]
    email_cfg = raw["email"]

    return AppConfig(
        llm=LLMConfig(
            provider=llm_cfg["provider"],
            model=os.getenv("LLM_MODEL", llm_cfg["model"]),
            embedding_model=os.getenv("LLM_EMBEDDING_MODEL", llm_cfg.get("embedding_model", "gemini-embedding-001")),
            api_key=os.getenv("LLM_API_KEY", ""),
        ),
        storage=StorageConfig(
            provider=os.getenv("STORAGE_PROVIDER", storage_cfg["provider"]),
            inbox_path=os.getenv("INBOX_PATH", storage_cfg["inbox_path"]),
            processed_path=storage_cfg["processed_path"],
        ),
        email=EmailConfig(
            sender=os.getenv("EMAIL_SENDER", ""),
            password=os.getenv("EMAIL_PASSWORD", ""),
            subscribers=email_cfg.get("subscribers", []),
            smtp_host=email_cfg["smtp_host"],
            smtp_port=email_cfg["smtp_port"],
            send_immediately=email_cfg.get("send_immediately", True),
            schedule_cron=email_cfg.get("schedule_cron", "0 8 * * *"),
        ),
        dedup_threshold=raw["deduplication"]["similarity_threshold"],
        log_level=raw.get("logging", {}).get("level", "INFO"),
        log_file=raw.get("logging", {}).get("log_file", "./logs/app.log"),
    )
