# Push ONLY the frontend folder (plus README) to origin/main.
#
# The working repo is the full monorepo (backend/, mobile/, mobile-web/), but
# the GitHub repo is frontend-only. This script builds a tree containing just
# README.md and frontend/ using a throwaway git index, commits it as a child
# of the current origin/main, and pushes it. Nothing in the working tree or
# the local branch history is touched.
#
# Usage: pwsh -File scripts/push-frontend.ps1 [-Message "commit message"]

param(
  [string]$Message = "Update frontend"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$index = Join-Path ([System.IO.Path]::GetTempPath()) "psm-frontend-index"
if (Test-Path -LiteralPath $index) { Remove-Item -LiteralPath $index -Force }

$env:GIT_INDEX_FILE = $index
try {
  git read-tree --empty
  if ($LASTEXITCODE -ne 0) { throw "git read-tree failed" }

  # frontend/.gitignore already excludes node_modules/, dist/ and .env
  git add -- README.md frontend
  if ($LASTEXITCODE -ne 0) { throw "git add failed" }

  $tree = (git write-tree).Trim()
  if ($LASTEXITCODE -ne 0) { throw "git write-tree failed" }

  Write-Host "--- files that will be pushed ---"
  git ls-tree -r --name-only $tree

  # Parent = last frontend-only commit on the remote (refs/frontend-base), so
  # the monorepo history never becomes reachable from origin/main.
  $base = (git rev-parse --verify --quiet refs/frontend-base).Trim()
  if (-not $base) { $base = (git rev-parse origin/main).Trim() }
  $remoteHead = (git rev-parse origin/main).Trim()

  $commit = (git commit-tree $tree -p $base -m $Message).Trim()
  if ($LASTEXITCODE -ne 0) { throw "git commit-tree failed" }

  Write-Host "--- pushing $commit (parent $base, remote head $remoteHead) ---"
  git push --force-with-lease="refs/heads/main:$remoteHead" origin "$commit`:refs/heads/main"
  if ($LASTEXITCODE -ne 0) { throw "git push failed" }

  git update-ref refs/frontend-base $commit
}
finally {
  Remove-Item Env:\GIT_INDEX_FILE -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $index) { Remove-Item -LiteralPath $index -Force }
}
