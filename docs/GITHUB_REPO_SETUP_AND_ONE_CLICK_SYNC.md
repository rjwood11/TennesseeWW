# GitHub Repo Setup + One-Click Sync

## Part 1: Create the GitHub repo (manual website steps)
1. Sign in to GitHub.
2. Click `+` (top-right) -> `New repository`.
3. Repository name: choose something like `tnww-v3`.
4. Owner: your personal account (or organization).
5. Visibility:
   - `Private` is recommended while you finish setup.
   - You can switch to public later if needed.
6. Do **not** initialize with README/.gitignore/license (leave unchecked).
7. Click `Create repository`.

After creation, copy the repo URL shown by GitHub. Example:
- `https://github.com/<OWNER>/<REPO>.git`

## Security settings to enable
1. GitHub account -> `Settings` -> `Password and authentication`:
   - Enable 2FA.
2. Repo -> `Settings` -> `Security`:
   - Enable Dependabot alerts.
   - Enable secret scanning (if available on your plan).
3. Repo -> `Settings` -> `Actions` -> `General`:
   - Allow GitHub Actions for this repo.
4. Repo -> `Settings` -> `Pages`:
   - Source: `GitHub Actions` (required for the Pages workflow in this repo).

## Part 2: One-time local connect
Open PowerShell in this folder:
- `C:\Users\rwjac\Desktop\Codex\TNWW\tnww-v3`

Run once (replace with your repo URL):

```powershell
.\push-to-github.ps1 -RemoteUrl https://github.com/<OWNER>/<REPO>.git -CommitMessage "Initial sync"
```

This first run will:
- initialize Git locally (if needed),
- connect `origin`,
- commit local files,
- push to `main`.

## Part 3: One-click updates after future local changes
After I make local changes for you, update GitHub with either:

- Double-click: `push-to-github.cmd`
- Or PowerShell:

```powershell
.\push-to-github.ps1 -CommitMessage "Describe your changes"
```

If you omit `-CommitMessage`, the script auto-generates one with timestamp.

## Notes about authentication
- GitHub no longer supports using account password for Git operations.
- On Windows, Git Credential Manager will prompt a browser sign-in/token flow the first time you push.
- After that, credentials are saved and the one-click update stays simple.
