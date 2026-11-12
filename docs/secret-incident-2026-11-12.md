# Historical VPS environment exposure

## Confirmed scope

The public repository contained `www/vps/.env` beginning with `efa6ca9` on
2026-09-12. Commit `f1c4f94` changed the tracked file, exposing its previous and
replacement values through the diff. The file contained database configuration,
`POSTGRES_PASSWORD`, `API_KEY`, and `ADMIN_API_KEY`. Commit `27769d0` deleted it
from the current tree, but the historical versions remain accessible.

No secret values are reproduced here.

## Verification on 2026-11-12

- Both historical sets of API keys are rejected with HTTP 401 by the running
  API container's ingestion and administrator authentication functions.
- PostgreSQL rejects both historical passwords over its container network with
  password authentication failures. A connection with the current credential
  succeeds.
- The historical values do not match the running API/database container
  environment or `/root/.env` on the VPS, or the local `www/vps/.env`.
- No exact matches for these historical secret values were found in the current
  tracked files. These checks do not establish whether past misuse occurred.

The exposed credentials have therefore already been replaced on the inspected
deployment. No production credentials were changed during this investigation.

## Preventing recurrence

The repository ignores private environment variants and checks the Git index for
private environment files and `secrets.h`. The check also catches files added
with `git add -f`. Sanitized `.example`, `.sample`, and `.template` files remain
allowed; their contents must be reviewed before committing.

Enable the local pre-commit guard in each checkout:

```sh
git config core.hooksPath .githooks
```

The `Private configuration guard` workflow runs the same check on pushes and
pull requests. This is a filename guard, not a general secret scanner. Local
hooks can be bypassed, and CI runs after a push; neither removes historical data.

## Outstanding history cleanup

Removing the old file from published history requires an explicitly approved,
coordinated rewrite of affected branches/tags and a force-push. The repository's
standing instructions prohibit doing this without a separate authorization.
The cleanup scope is every historical version of `www/vps/.env`, including the
version preceding `f1c4f94`, rather than just that one commit.

After approval, enumerate remote refs and forks, perform the cleanup in a
separate clone with `git-filter-repo`, verify the resulting history, and update
only affected refs with safeguards against overwriting concurrent changes.
Collaborators must re-clone or carefully rebase to avoid reintroducing old
history. Copies in existing clones, forks, and cached commit views can persist;
GitHub Support may be needed for residual references. Keep the monitoring
incident open until its locations and remaining cleanup have been reviewed.

Reference: [GitHub's sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
