# chill — statusline badge (Windows). Prints [CHILL], [CHILL:DAWG],
# [CHILL:MAFA], or nothing when off.

$dir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$flag = Join-Path $dir '.chill-active'
$level = ''
if (Test-Path $flag) { $level = (Get-Content $flag -Raw).Trim() }

switch ($level) {
  'yo'   { Write-Output '[CHILL]' }
  'dawg' { Write-Output '[CHILL:DAWG]' }
  'mafa' { Write-Output '[CHILL:MAFA]' }
  default { }
}