import os
import yaml
from dataclasses import dataclass
from typing import List
from dotenv import load_dotenv

load_dotenv()


@dataclass
class WebsiteConfig:
    base_url: str   # e.g. http://localhost:3000 or https://yoursite.com


@dataclass
class RewriterConfig:
    grouping_threshold: float   # cosine similarity threshold for same-story grouping


@dataclass
class LLMConfig:
    provider: str         # "gemini" or "openai"
    model: str            # e.g. "gemini-2.5-flash" — used for extraction & summarization
    embedding_model: str  # e.g. "gemini-embedding-exp-03-07" — used for deduplication
    api_key: str          # from env: LLM_API_KEY
    max_concurrent: int = 3  # parallel API calls (3 for Tier 1, 5-10 for Tier 2)


@dataclass
class StorageConfig:
    provider: str        # "local", "s3", "azure", "gcs"
    inbox_path: str
    processed_path: str
    editorial_inbox_path: str = ""


@dataclass
class EmailConfig:
    sender: str
    subscribers: List[str]
    send_immediately: bool
    schedule_cron: str
    title: str
    newspaper_name: str
    subscribe_url: str
    unsubscribe_url: str
    website_base_url: str


@dataclass
class AppConfig:
    llm: LLMConfig
    storage: StorageConfig
    email: EmailConfig
    website: WebsiteConfig
    rewriter: RewriterConfig
    dedup_threshold: float
    log_level: str
    log_file: str
    max_newspaper_age_days: int = 3  # 0 = disabled


def load_config(config_path: str = "config/config.yaml") -> AppConfig:
    with open(config_path, "r") as f:
        raw = yaml.safe_load(f)

    llm_cfg = raw["llm"]
    storage_cfg = raw["storage"]
    email_cfg = raw["email"]

    website_cfg = raw.get("website", {})
    rewriter_cfg = raw.get("rewriter", {})

    return AppConfig(
        llm=LLMConfig(
            provider=llm_cfg["provider"],
            model=os.getenv("LLM_MODEL", llm_cfg["model"]),
            embedding_model=os.getenv("LLM_EMBEDDING_MODEL", llm_cfg.get("embedding_model", "gemini-embedding-001")),
            api_key=os.getenv("LLM_API_KEY", ""),
            max_concurrent=int(llm_cfg.get("max_concurrent", 3)),
        ),
        storage=StorageConfig(
            provider=os.getenv("STORAGE_PROVIDER", storage_cfg["provider"]),
            inbox_path=os.getenv("INBOX_PATH", storage_cfg["inbox_path"]),
            processed_path=storage_cfg["processed_path"],
            editorial_inbox_path=os.getenv(
                "EDITORIAL_INBOX_PATH",
                storage_cfg.get("editorial_inbox_path", "")
            ),
        ),
        email=EmailConfig(
            sender=os.getenv("EMAIL_SENDER", email_cfg.get("sender", "news@theamericanexpress.us")),
            subscribers=email_cfg.get("subscribers", []),
            send_immediately=email_cfg.get("send_immediately", True),
            schedule_cron=email_cfg.get("schedule_cron", "0 8 * * *"),
            title=email_cfg.get("title", "Daily News Digest"),
            newspaper_name=email_cfg.get("newspaper_name", "The American Express Times"),
            subscribe_url=email_cfg.get("subscribe_url", "#"),
            unsubscribe_url=email_cfg.get("unsubscribe_url", "#"),
            website_base_url=os.getenv("WEBSITE_BASE_URL", website_cfg.get("base_url", "http://localhost:3000")),
        ),
        website=WebsiteConfig(
            base_url=os.getenv("WEBSITE_BASE_URL", website_cfg.get("base_url", "http://localhost:3000")),
        ),
        rewriter=RewriterConfig(
            grouping_threshold=float(rewriter_cfg.get("grouping_threshold", 0.80)),
        ),
        dedup_threshold=raw["deduplication"]["similarity_threshold"],
        log_level=raw.get("logging", {}).get("level", "INFO"),
        log_file=raw.get("logging", {}).get("log_file", "./logs/app.log"),
        max_newspaper_age_days=int(raw.get("processing", {}).get("max_newspaper_age_days", 3)),
    )
