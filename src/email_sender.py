import logging
import os
from typing import List, Tuple
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader
import resend

from src.models import ProcessedArticle

logger = logging.getLogger(__name__)


class EmailSender:

    def __init__(self, config, db_provider=None):
        """
        config: EmailConfig dataclass with sender, send_immediately, etc.
        db_provider: DBProvider instance for fetching subscribers from the database.
        """
        self.config = config
        self.db = db_provider
        template_dir = Path(__file__).parent.parent / "templates"
        self.jinja_env = Environment(loader=FileSystemLoader(str(template_dir)))

        resend_api_key = os.getenv("RESEND_API_KEY", "")
        if not resend_api_key:
            logger.error("RESEND_API_KEY not set — cannot send emails.")
        resend.api_key = resend_api_key

    def _get_subscribers(self) -> List[Tuple[str, str]]:
        """
        Get subscribers from the database.
        Returns list of (email, unsubscribe_token) tuples.
        Falls back to config.yaml subscribers (with empty tokens) if DB has none.
        """
        if self.db:
            try:
                db_subscribers = self.db.get_subscribers()
                if db_subscribers:
                    logger.info("Loaded %d subscribers from database.", len(db_subscribers))
                    return db_subscribers
            except Exception as e:
                logger.warning("Failed to load subscribers from DB: %s", e)

        # Fallback: config.yaml subscribers (no unsubscribe token)
        if self.config.subscribers:
            logger.info("Using %d subscribers from config.yaml (fallback).", len(self.config.subscribers))
            return [(email, "") for email in self.config.subscribers]

        return []

    def send_digest(self, articles: List[ProcessedArticle]) -> bool:
        """
        Send the news digest email to all subscribers.
        Returns True if at least one email was sent successfully.
        """
        unique_articles = [a for a in articles if not a.is_duplicate]
        if not unique_articles:
            logger.info("No unique articles to send in digest.")
            return False

        if not os.getenv("RESEND_API_KEY", ""):
            logger.error("RESEND_API_KEY not set — cannot send digest.")
            return False

        subscribers = self._get_subscribers()
        if not subscribers:
            logger.warning("No subscribers found — skipping email digest.")
            return False

        subject = f"News Digest — {datetime.now().strftime('%B %d, %Y')}"

        sent_count = 0
        for email, unsubscribe_token in subscribers:
            try:
                # Generate per-recipient unsubscribe URL
                if unsubscribe_token:
                    unsubscribe_url = (
                        f"{self.config.website_base_url}/api/unsubscribe"
                        f"?token={unsubscribe_token}"
                    )
                else:
                    unsubscribe_url = self.config.unsubscribe_url

                html_body = self._render_template(unique_articles, unsubscribe_url)
                self._send_email(email, subject, html_body)
                sent_count += 1
                logger.info("Digest sent to %s (%d articles)", email, len(unique_articles))
            except Exception as e:
                logger.error("Failed to send email to %s: %s", email, e, exc_info=True)

        if sent_count == 0:
            logger.error("Email digest failed for ALL %d subscribers.", len(subscribers))
        else:
            logger.info("Email digest delivered to %d/%d subscribers.", sent_count, len(subscribers))

        return sent_count > 0

    def _render_template(self, articles: List[ProcessedArticle], unsubscribe_url: str) -> str:
        template = self.jinja_env.get_template("email_digest.html")
        return template.render(
            articles=articles,
            date=datetime.now().strftime("%B %d, %Y"),
            total_count=len(articles),
            title=self.config.title,
            subscribe_url=self.config.subscribe_url,
            unsubscribe_url=unsubscribe_url,
            website_base_url=self.config.website_base_url,
        )

    def _send_email(self, recipient: str, subject: str, html_body: str) -> None:
        params = {
            "from": f"{self.config.title} <{self.config.sender}>",
            "to": [recipient],
            "subject": subject,
            "html": html_body,
        }
        response = resend.Emails.send(params)
        logger.debug("Resend response for %s: %s", recipient, response)
