"""Outbound email via SMTP.

Email is used to deliver new-hire login credentials and password-reset OTPs.
Settings come from ``backend.config`` (SMTP_HOST, SMTP_PORT, SMTP_USERNAME,
SMTP_PASSWORD, SMTP_FROM, SMTP_USE_TLS, SMTP_USE_SSL). When SMTP is not
configured, sending is skipped and reported through the return value, so the
calling request never fails because of mail issues.
"""
import logging
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from backend import config

logger = logging.getLogger(__name__)


def send_email(to_email, subject, html_body, text_body=None):
    """Send an email. Returns ``(sent: bool, reason: str)``.

    Never raises: configuration or transport problems are reported through the
    return value so callers can surface a friendly message to the admin.
    """
    to_email = (to_email or "").strip()
    if not to_email:
        return False, "Recipient has no email address"
    if not config.smtp_configured():
        logger.warning("SMTP is not configured; skipped email to %s", to_email)
        return False, "Email is not configured on the server"

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((config.smtp_from_name(), config.smtp_from()))
    message["To"] = to_email
    message.set_content(text_body or _strip_html(html_body))
    message.add_alternative(html_body, subtype="html")

    host = config.smtp_host()
    port = config.smtp_port()

    try:
        if config.smtp_use_ssl():
            with smtplib.SMTP_SSL(host, port, timeout=20, context=ssl.create_default_context()) as server:
                if config.smtp_username():
                    server.login(config.smtp_username(), config.smtp_password())
                server.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=20) as server:
                server.ehlo()
                if config.smtp_use_tls():
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                if config.smtp_username():
                    server.login(config.smtp_username(), config.smtp_password())
                server.send_message(message)
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller
        logger.error("Failed to send email to %s: %s", to_email, exc)
        return False, f"Could not send email: {exc}"

    logger.info("Sent email to %s (%s)", to_email, subject)
    return True, "sent"


def _strip_html(html):
    text = re.sub(r"<br\s*/?>", "\n", html or "")
    text = re.sub(r"</(p|tr|div)>", "\n", text)
    text = re.sub(r"</td>", "  ", text)
    return re.sub(r"<[^>]+>", "", text).strip()


def _shell(title, body_html):
    return f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#1d4ed8;padding:18px 24px;">
      <span style="color:#ffffff;font-size:16px;font-weight:700;">PSM Office Manager</span>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">{title}</h2>
      {body_html}
    </div>
    <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <span style="color:#94a3b8;font-size:12px;">This is an automated message. Please do not reply.</span>
    </div>
  </div>
</body>
</html>"""


def _credentials_html(name, role_label, identifier, password):
    greeting = f"Hi {name}," if name else "Hello,"
    return _shell(
        "Your account is ready",
        f"""
<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 14px;">{greeting}</p>
<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 16px;">
  Your {role_label} account has been created. Use the credentials below to sign in to the PSM Office mobile app.
</p>
<table style="border-collapse:collapse;width:100%;margin:0 0 16px;">
  <tr>
    <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;">{role_label} ID</td>
    <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:15px;font-weight:700;color:#0f172a;">{identifier}</td>
  </tr>
  <tr>
    <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;">Password</td>
    <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:15px;font-weight:700;color:#0f172a;">{password}</td>
  </tr>
</table>
<p style="font-size:14px;line-height:1.6;color:#64748b;margin:0;">
  For your security, please change this password after your first login.
</p>
""",
    )


def _otp_html(name, otp, ttl_minutes):
    greeting = f"Hi {name}," if name else "Hello,"
    return _shell(
        "Your verification code",
        f"""
<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 14px;">{greeting}</p>
<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 16px;">
  Use this code to reset your PSM Office app password:
</p>
<div style="text-align:center;margin:8px 0 16px;">
  <span style="display:inline-block;letter-spacing:8px;font-size:32px;font-weight:800;color:#0f172a;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:16px 24px;">{otp}</span>
</div>
<p style="font-size:14px;line-height:1.6;color:#64748b;margin:0;">
  This code expires in {ttl_minutes} minutes. If you didn't request it, you can safely ignore this email.
</p>
""",
    )


def send_credentials_email(to_email, name, identifier, password, person_type="employee"):
    """Send the new hire their login ID and password."""
    role_label = "Intern" if person_type == "intern" else "Employee"
    subject = f"Your PSM Office {role_label} account"
    html = _credentials_html(name, role_label, identifier, password)
    text = (
        f"Hello {name or ''},\n\n"
        f"Your PSM Office {role_label} account is ready.\n\n"
        f"{role_label} ID: {identifier}\n"
        f"Password: {password}\n\n"
        "Sign in with these in the PSM Office app. For your security, change this "
        "password after your first login."
    )
    return send_email(to_email, subject, html, text_body=text)


def send_password_otp_email(to_email, name, otp, person_type="employee"):
    """Send a one-time code used to reset the app password."""
    ttl_minutes = max(1, config.otp_ttl_seconds() // 60)
    subject = "Your PSM Office password reset code"
    html = _otp_html(name, otp, ttl_minutes)
    text = (
        f"Hello {name or ''},\n\n"
        f"Your PSM Office password reset code is: {otp}\n"
        f"It expires in {ttl_minutes} minutes.\n\n"
        "If you did not request this, you can ignore this email."
    )
    return send_email(to_email, subject, html, text_body=text)
