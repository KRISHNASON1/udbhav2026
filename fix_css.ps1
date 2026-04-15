$file = 'src/style.css'
$css = [System.IO.File]::ReadAllText($file)

# Find the schedule bg-glow block start and JC section boundary
$schStart = $css.IndexOf('/* ── Background ── */' + "`r`n" + '.sch-bg-glow')
if ($schStart -lt 0) {
  $schStart = $css.IndexOf("/* ── Background ── */`n.sch-bg-glow")
}
Write-Host "Schedule block starts at: $schStart"

# Find the JC heading to know where schedule CSS ends
$jcStart = $css.IndexOf('/* ════════════════════════════════════════════════════════════════════════════' + "`r`n   JUDGING CRITERIA")
if ($jcStart -lt 0) {
  $jcStart = $css.IndexOf('JUDGING CRITERIA')
  # step back to find the start of the comment block
  $jcStart = $css.LastIndexOf('/* ════', $jcStart)
}
Write-Host "JC heading starts at: $jcStart"
Write-Host "Done finding boundaries"
