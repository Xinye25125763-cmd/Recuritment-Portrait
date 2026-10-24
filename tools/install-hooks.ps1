<#
  安装 Git pre-commit 钩子 —— 防止个人数据误提交

  用法：在项目根目录执行
      powershell -ExecutionPolicy Bypass -File tools\install-hooks.ps1

  钩子做两件事：
    1. 拦截个人数据文件（防止 git add -f 绕过 .gitignore）
    2. 扫描待提交内容里的手机号 / 身份证号，命中就阻止提交

  设计参考 ai-job-search 的 security_guards.py：
  目标是"把危险改动变得刺眼"，而不是做到绝对不可能。
  铁了心的人总能用 --no-verify 绕过，这拦的是意外。
#>

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$hookDir  = Join-Path $repoRoot '.git\hooks'

if (-not (Test-Path $hookDir)) {
    Write-Host "[跳过] 未找到 .git 目录。请先执行 git init，再运行本脚本。" -ForegroundColor Yellow
    exit 0
}

$hookPath = Join-Path $hookDir 'pre-commit'

$hookBody = @'
#!/bin/sh
# 秋招画像系统 —— 个人数据提交防护
# 由 tools/install-hooks.ps1 生成，请勿手动编辑

BLOCKED=0
FILES=$(git diff --cached --name-only --diff-filter=ACM)

# ── 1. 文件名黑名单 ──
for f in $FILES; do
  case "$f" in
    *档案_*.json|*profile*.json|portrait*.json|tracker.csv|userdata/*|data/*)
      echo "  x 个人数据文件: $f"
      BLOCKED=1
      ;;
  esac
done

# ── 2. 内容扫描 ──
for f in $FILES; do
  case "$f" in
    *.json|*.md|*.csv|*.txt|*.js|*.html)
      if git show ":$f" 2>/dev/null | grep -qE '(^|[^0-9])1[3-9][0-9]{9}([^0-9]|$)'; then
        echo "  x 疑似手机号: $f"
        BLOCKED=1
      fi
      if git show ":$f" 2>/dev/null | grep -qE '[1-9][0-9]{5}(19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[0-9]{3}[0-9Xx]'; then
        echo "  x 疑似身份证号: $f"
        BLOCKED=1
      fi
      ;;
  esac
done

if [ $BLOCKED -eq 1 ]; then
  echo ""
  echo "=================================================="
  echo " 提交被阻止：检测到个人数据"
  echo "=================================================="
  echo ""
  echo " 本项目是公开仓库，个人信息一旦提交："
  echo "   - 任何人 fork 都能拿到"
  echo "   - Git 历史里永久留存，删文件也删不掉"
  echo ""
  echo " 请执行 git reset HEAD <文件> 取消暂存后重试。"
  echo ""
  echo " 若确认是误报（如示例用虚构号码），"
  echo " 可用 git commit --no-verify 跳过。"
  echo ""
  exit 1
fi

exit 0
'@

$hookBody = $hookBody -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($hookPath, $hookBody, (New-Object System.Text.UTF8Encoding $false))

Write-Host "[完成] pre-commit 钩子已安装" -ForegroundColor Green
Write-Host ""
Write-Host "现在起，以下情况会阻止提交：" -ForegroundColor Cyan
Write-Host "  - 个人档案 JSON / tracker.csv / userdata 目录"
Write-Host "  - 任何文件里出现手机号或身份证号"
