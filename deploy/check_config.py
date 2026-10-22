"""Validate a production environment file before the service is started.

Usage:
    python deploy/check_config.py /etc/psm-office/psm-office.env [/opt/psm-office]

Exit codes:
    0 - the configuration would start in production mode
    1 - the configuration is rejected by backend.config.validate_config()
    2 - the environment file is missing
"""
import os
import sys
from pathlib import Path


def load_env_file(path):
    """Parse a systemd-style KEY=value file into os.environ."""
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        os.environ[key] = value


def main():
    env_path = sys.argv[1] if len(sys.argv) > 1 else "/etc/psm-office/psm-office.env"
    repo = sys.argv[2] if len(sys.argv) > 2 else "/opt/psm-office"

    if not os.path.exists(env_path):
        print(f"environment file not found: {env_path}")
        return 2

    load_env_file(env_path)

    # backend.config.validate_config() is a no-op outside production mode, so
    # force it here - otherwise a development-flavoured env file would be
    # reported as valid and the server would start without the hardening.
    declared = (os.getenv("FLASK_ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
    if declared != "production":
        print(
            "note: FLASK_ENV is not 'production' in the environment file; "
            "validating with production rules enforced"
        )
    os.environ["FLASK_ENV"] = "production"

    sys.path.insert(0, repo)
    from backend import config

    problems = config.validate_config()
    if problems:
        print("production configuration is NOT ready:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("production configuration OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
