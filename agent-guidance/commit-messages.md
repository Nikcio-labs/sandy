# Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) style. Keep the description lowercase and imperative (e.g. `add`, not `adds` or `added`).

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
feat!: change the saved template file format
```
