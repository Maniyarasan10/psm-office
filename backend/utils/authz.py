"""Object-level authorization helpers.

Every protected endpoint that accepts a person/task/document identifier from a
client must verify that the signed-in token actually owns (or may see) that
object. These helpers keep that check consistent:

* no token is only allowed when AUTH_REQUIRED is disabled (legacy/dev mode);
* administrators may access everything;
* everyone else is limited to their own records.
"""
from backend import config
from backend.utils.auth import current_auth


def is_admin(auth=None):
    auth = auth if auth is not None else current_auth()
    return bool(auth and auth.get("role") == "admin")


def token_subject(auth=None):
    auth = auth if auth is not None else current_auth()
    if not auth:
        return ""
    return str(auth.get("sub") or "")


def subject_matches(auth, *identifiers):
    """True when the token subject is one of ``identifiers``."""
    subject = token_subject(auth)
    if not subject:
        return False
    return any(
        value is not None and subject == str(value)
        for value in identifiers
        if str(value or "").strip()
    )


def can_access_person(auth, *identifiers):
    """Admin may access anyone; a user may access only their own identifiers.

    Identifiers should include the Mongo ``_id`` and the public employee/intern
    ID so older clients that send either value keep working.
    """
    if is_admin(auth):
        return True
    if not auth:
        return not config.auth_required()
    return subject_matches(auth, *identifiers)


def can_access_task(auth, task):
    if not task:
        return False
    if is_admin(auth):
        return True
    if not auth:
        return not config.auth_required()
    return subject_matches(
        auth, task.get("assigned_to"), task.get("created_by")
    )
