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


class EmailSender:

    def __init__(self, config):
        """
        config: EmailConfig dataclass with sender, password, subscribers,
                smtp_host, smtp_port, send_immediately, schedule_cron
        """
        self.config = config
        template_dir = Path(__file__).parent.parent / "templates"
        self.jinja_env = Environment(loader=FileSystemLoader(str(template_dir)))

    def send_digest(self, articles: List[ProcessedArticle]) -> None:
        """
        Send the news digest email to all subscribers.
        Only sends non-duplicate articles.
        """
        unique_articles = [a for a in articles if not a.is_duplicate]
        if not unique_articles:
            logger.info("No unique articles to send in digest.")
            return

        subject = f"News Digest — {datetime.now().strftime('%B %d, %Y')}"
        html_body = self._render_template(unique_articles)

        for recipient in self.config.subscribers:
            try:
                self._send_email(recipient, subject, html_body)
                logger.info("Digest sent to %s (%d articles)", recipient, len(unique_articles))
            except Exception as e:
                logger.error("Failed to send email to %s: %s", recipient, e)

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

        with smtplib.SMTP(self.config.smtp_host, self.config.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(self.config.sender, self.config.password)
            server.sendmail(self.config.sender, recipient, msg.as_string())
