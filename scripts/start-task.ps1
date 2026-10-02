[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9][a-z0-9-]*$')]
  [string]$Owner,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9][a-z0-9-]*$')]
  [string]$Task
)

$ErrorActionPreference = 'Stop'

$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) {
  throw '当前目录不是 Git 仓库。请先在项目根目录运行。'
}

if (git status --porcelain) {
  throw '当前工作区有未提交改动。请先提交或切换到干净工作区。'
}

$branch = "work/$Owner/$Task"
$repoName = Split-Path -Leaf $repoRoot
$worktreesRoot = Join-Path (Split-Path -Parent $repoRoot) "$repoName.worktrees"
$target = Join-Path $worktreesRoot "$Owner-$Task"
$resolvedParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $target))
$expectedParent = [System.IO.Path]::GetFullPath($worktreesRoot)

if ($resolvedParent -ne $expectedParent) {
  throw '工作区目标超出预期目录。'
}

if (Test-Path -LiteralPath $target) {
  throw "目标工作区已存在：$target"
}

git fetch origin main
if ($LASTEXITCODE -ne 0) {
  throw '无法获取 origin/main。请检查网络与仓库权限。'
}

New-Item -ItemType Directory -Path $worktreesRoot -Force | Out-Null
git worktree add -b $branch $target origin/main
if ($LASTEXITCODE -ne 0) {
  throw '创建 Git Worktree 失败。'
}

Write-Host "已创建分支：$branch"
Write-Host "独立工作区：$target"
Write-Host "下一步：cd '$target'"
