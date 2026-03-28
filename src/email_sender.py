import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

from src.models import ProcessedArticle

logger = logging.getLogger(__name__)

SMTP_TIMEOUT = 30  # seconds


class EmailSender:

    def __init__(self, config):
        """
        config: EmailConfig dataclass with sender, password, subscribers,
                smtp_host, smtp_port, send_immediately, schedule_cron
        """
        self.config = config
        template_dir = Path(__file__).parent.parent / "templates"
        self.jinja_env = Environment(loader=FileSystemLoader(str(template_dir)))

    def send_digest(self, articles: List[ProcessedArticle]) -> bool:
        """
        Send the news digest email to all subscribers.
        Returns True if at least one email was sent successfully.
        """
        unique_articles = [a for a in articles if not a.is_duplicate]
        if not unique_articles:
            logger.info("No unique articles to send in digest.")
            return False

        if not self.config.sender or not self.config.password:
            logger.error(
                "EMAIL_SENDER or EMAIL_PASSWORD not set — cannot send digest. "
                "sender=%s, password=%s",
                self.config.sender or "(empty)",
                "set" if self.config.password else "(empty)",
            )
            return False

        if not self.config.subscribers:
            logger.warning("No subscribers configured — skipping email digest.")
            return False

        subject = f"News Digest — {datetime.now().strftime('%B %d, %Y')}"

        try:
            html_body = self._render_template(unique_articles)
        except Exception as e:
            logger.error("Failed to render email template: %s", e, exc_info=True)
            return False

        sent_count = 0
        for recipient in self.config.subscribers:
            try:
                self._send_email(recipient, subject, html_body)
                sent_count += 1
                logger.info("Digest sent to %s (%d articles)", recipient, len(unique_articles))
            except Exception as e:
                logger.error("Failed to send email to %s: %s", recipient, e, exc_info=True)

        if sent_count == 0:
            logger.error("Email digest failed for ALL %d subscribers.", len(self.config.subscribers))
        else:
            logger.info("Email digest delivered to %d/%d subscribers.", sent_count, len(self.config.subscribers))

        return sent_count > 0

    def _render_template(self, articles: List[ProcessedArticle]) -> str:
        template = self.jinja_env.get_template("email_digest.html")
        return template.render(
            articles=articles,
            date=datetime.now().strftime("%B %d, %Y"),
            total_count=len(articles),
            title=self.config.title,
            subscribe_url=self.config.subscribe_url,
            unsubscribe_url=self.config.unsubscribe_url,
            website_base_url=self.config.website_base_url,
        )

    def _send_email(self, recipient: str, subject: str, html_body: str) -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self.config.sender
        msg["To"] = recipient
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(self.config.smtp_host, self.config.smtp_port, timeout=SMTP_TIMEOUT) as server:
            server.ehlo()
            server.starttls()
            server.login(self.config.sender, self.config.password)
            server.sendmail(self.config.sender, recipient, msg.as_string())
