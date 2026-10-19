"""Temporary password generation for new accounts."""
import secrets

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"


def generate_temp_password(length=8):
    """A readable random password (no look-alike characters)."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))
