# Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) style:

```
type(scope): description
```

## Types

| Type | Use |
|------|-----|
| `feat` | New feature (minor release) |
| `fix` | Bug fix (patch release) |
| `docs` | Documentation only |
| `chore` | Maintenance, deps, release |
| `ci` | CI/CD changes |
| `test` | Test changes |
| `refactor` | Code changes that are neither features nor fixes |

`feat`, `fix`, and `refactor` trigger a release-please release; other types land without one. Add `!` after the type (or a `BREAKING CHANGE:` footer in the body) for a major release:

```
feat(templates)!: change the saved template file format
```

## Scopes

Common scopes: `frontend` (React/TypeScript in `src/`), `app` (Tauri/Rust in `src-tauri/`), `templates`, `setup`, `docs`, `deps`. Omit the scope when the change spans the whole app or doesn't fit one.

## Examples

```
feat(frontend): add search by workspace to the sandbox list
fix(app): quote sandbox names when invoking the sbx CLI
docs: update README build instructions
```
