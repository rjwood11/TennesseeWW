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

function Get-PorcelainStatus {
  $status = git status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git status --porcelain"
  }
  return [string]$status
}

function Has-WorkingTreeChanges {
  return -not [string]::IsNullOrWhiteSpace((Get-PorcelainStatus))
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
  $stashedForPull = $false
  $pullStashName = "push-to-github pre-pull $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  if (Has-WorkingTreeChanges) {
    Write-Host "Stashing local changes before rebase..."
    Invoke-Git @("stash", "push", "-u", "-m", $pullStashName)
    $stashedForPull = $true
  }

  Write-Host "Pulling latest from origin/$Branch with rebase..."
  Invoke-Git @("pull", "--rebase", "origin", $Branch) -AllowFailure
  if ($LASTEXITCODE -ne 0) {
    if ($stashedForPull) {
      Write-Host "Restoring stashed local changes after failed rebase..."
      Invoke-Git @("stash", "pop") -AllowFailure
    }
    throw "Pull/rebase from origin/$Branch failed. Resolve it manually, then rerun the script."
  }

  if ($stashedForPull) {
    Write-Host "Restoring stashed local changes..."
    Invoke-Git @("stash", "pop")
  }
}

Write-Host "Staging changes..."
Invoke-Git @("add", "-A")

$pending = Get-PorcelainStatus
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
