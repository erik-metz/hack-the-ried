"""A separate, optional read-only service identity; never an administrator."""

import hashlib
import os
import re
import secrets
from pathlib import Path

from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)


def enabled():
    return os.getenv('MCP_API_ENABLED', 'false').lower() == 'true'


def digests():
    path = os.getenv('MCP_SERVICE_DIGESTS_FILE')
    if not path:
        raise RuntimeError('MCP_SERVICE_DIGESTS_FILE is required when MCP is enabled')
    values = Path(path).read_text().split()
    if not 1 <= len(values) <= 2 or any(not re.fullmatch('[0-9a-f]{64}', v) for v in values):
        raise RuntimeError('Configure one or two SHA-256 MCP service key digests')
    for name in ('API_KEY', 'ADMIN_API_KEY'):
        existing = hashlib.sha256(os.getenv(name, '').strip().encode()).hexdigest()
        if existing in values:
            raise RuntimeError('MCP service key must differ from ingestion and admin keys')
    return values


def validate_mcp_config():
    if enabled():
        digests()


def verify_mcp_service_key(credentials: HTTPAuthorizationCredentials | None = Security(bearer)):
    if not enabled():
        raise HTTPException(404, 'Not found')
    candidate = hashlib.sha256((credentials.credentials if credentials else '').encode()).hexdigest()
    if not any(secrets.compare_digest(candidate, expected) for expected in digests()):
        raise HTTPException(401, 'Invalid service credential', headers={'WWW-Authenticate': 'Bearer'})
