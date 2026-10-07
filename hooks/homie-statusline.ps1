# homie — statusline badge (Windows). Prints [CHILL], [CHILL:DAWG],
# [CHILL:MAFA], or nothing when off.

$dir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$flag = Join-Path $dir '.homie-active'
$level = ''
if (Test-Path $flag) { $level = (Get-Content $flag -Raw).Trim() }

switch ($level) {
  'yo'   { Write-Output '[HOMIE]' }
  'dawg' { Write-Output '[HOMIE:DAWG]' }
  'mafa' { Write-Output '[HOMIE:MAFA]' }
  default { }
}