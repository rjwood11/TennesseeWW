param(
  [string]$RemoteUrl = "",
  [string]$Branch = "main",
  [string]$CommitMessage = "",
  [switch]$SkipPull
)

$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $name"
  }
}

function Invoke-Git {
  param(
    [Parameter(Mandatory = $true)][string[]]$Args,
    [switch]$AllowFailure
  )
  & git @Args
  if (-not $AllowFailure -and $LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Args -join ' ')"
  }
}

function In-GitRepo {
  return Test-Path (Join-Path (Get-Location) ".git")
}

function Has-RemoteOrigin {
  $remotes = git remote
  if ($LASTEXITCODE -ne 0) {
    return $false
  }
  return ($remotes -split "\r?\n") -contains "origin"
}

function Has-Commit {
  $headFile = Join-Path (Get-Location) ".git\HEAD"
  if (-not (Test-Path $headFile)) {
    return $false
  }
  $head = (Get-Content $headFile -Raw).Trim()
  if ($head -match "^ref:\s+(.+)$") {
    $ref = $Matches[1].Trim().Replace("/", "\")
    $refFile = Join-Path (Join-Path (Get-Location) ".git") $ref
    return Test-Path $refFile
  }
  return -not [string]::IsNullOrWhiteSpace($head)
}

Require-Command git

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

if (-not (In-GitRepo)) {
  Write-Host "Initializing Git repository..."
  Invoke-Git @("init")
}

if (-not (Has-RemoteOrigin)) {
  if ([string]::IsNullOrWhiteSpace($RemoteUrl)) {
    throw "No 'origin' remote configured. Re-run once with -RemoteUrl https://github.com/<OWNER>/<REPO>.git"
  }
  Write-Host "Adding origin remote: $RemoteUrl"
  Invoke-Git @("remote", "add", "origin", $RemoteUrl)
} elseif (-not [string]::IsNullOrWhiteSpace($RemoteUrl)) {
  Write-Host "Updating origin remote: $RemoteUrl"
  Invoke-Git @("remote", "set-url", "origin", $RemoteUrl)
}

$currentBranch = (git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($currentBranch)) {
  Write-Host "Creating branch '$Branch'..."
  Invoke-Git @("checkout", "-b", $Branch)
} elseif ($currentBranch -ne $Branch) {
  Write-Host "Switching to branch '$Branch'..."
  $targetExists = -not [string]::IsNullOrWhiteSpace((git branch --list $Branch))
  if ($targetExists) {
    Invoke-Git @("checkout", $Branch)
  } elseif (Has-Commit) {
    Invoke-Git @("checkout", "-b", $Branch)
  } else {
    Invoke-Git @("branch", "-M", $Branch)
  }
}

if (-not $SkipPull) {
  Write-Host "Pulling latest from origin/$Branch (if branch exists)..."
  Invoke-Git @("pull", "--rebase", "origin", $Branch) -AllowFailure
  if ($LASTEXITCODE -ne 0) {
    Write-Host "No remote branch yet, or pull needs manual resolution. Continuing..." -ForegroundColor Yellow
  }
}

Write-Host "Staging changes..."
Invoke-Git @("add", "-A")

$pending = git status --porcelain
if ([string]::IsNullOrWhiteSpace($pending)) {
  Write-Host "No local changes to commit."
  Write-Host "Pushing current branch to origin..."
  Invoke-Git @("push", "-u", "origin", $Branch)
  exit 0
}

if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $CommitMessage = "sync: update TNWW ($timestamp)"
}

$authorName = [string](git config user.name)
$authorEmail = [string](git config user.email)
$authorName = $authorName.Trim()
$authorEmail = $authorEmail.Trim()
if ([string]::IsNullOrWhiteSpace($authorName) -or [string]::IsNullOrWhiteSpace($authorEmail)) {
  throw "Git identity not set. Run: git config --global user.name ""Your Name"" ; git config --global user.email ""you@example.com"""
}

Write-Host "Committing: $CommitMessage"
Invoke-Git @("commit", "-m", $CommitMessage)

Write-Host "Pushing to origin/$Branch..."
Invoke-Git @("push", "-u", "origin", $Branch)

Write-Host ""
Write-Host "Done. GitHub repo has been updated." -ForegroundColor Green
