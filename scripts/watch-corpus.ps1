# The live corpus board: one frame per interval, with a real Clear-Host between them.
#
# The board can repaint itself in place with ANSI escapes (`node scripts/status.ts --follow`), but
# the classic Windows console host does not honour them: the redraw lands as a fresh copy of the
# frame below the last one, and the window scrolls instead of holding still. Clearing the screen
# from the host before each frame is what repaints correctly in both consoles.
#
# Launch it with scripts\watch-corpus.cmd, or: powershell -NoProfile -File scripts/watch-corpus.ps1
param([int]$Interval = 2000)

# The board draws its bar with block characters and its spinner with braille, so node's UTF-8 has
# to be read as UTF-8. Without this the console's OEM code page decodes every byte on its own and
# the frame fills with mojibake (and a mojibake bar is three times as wide, which wraps the line).
try {
	[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
	# a host with no console handle to re-code: the board still draws, just in its fallback glyphs
}

Set-Location (Split-Path -Parent $PSScriptRoot)

while ($true) {
	# Read the frame first and clear only once it is in hand. Clearing before the process runs leaves
	# the window blank for as long as node takes to boot, which is the flash the board is meant not
	# to have: a third of a second of nothing, every interval.
	$frame = & node scripts/status.ts 2>&1
	Clear-Host
	$frame
	Start-Sleep -Milliseconds $Interval
}
