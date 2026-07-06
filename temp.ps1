$content = Get-Content .\docs\.ai-handoff.md
$lines = $content -split "`r`n"
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i].Trim() -eq '## Current Task') {
        $lines[$i+1] = 'Implement asset download endpoint'
    }
    if ($lines[$i].Trim() -eq '## Next Task') {
        $lines[$i+1] = 'Implement asset deletion endpoint'
    }
}
$lines -join "`r`n" | Set-Content .\docs\.ai-handoff.md
