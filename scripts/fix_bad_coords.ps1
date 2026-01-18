param(
  [string]$CsvPath = "data/poi.csv"
)

if (!(Test-Path -Path $CsvPath)) {
  Write-Error "CSV not found: $CsvPath"
  exit 1
}

$bak = "$CsvPath.bak.$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item -Path $CsvPath -Destination $bak
Write-Host "Backup created: $bak"

$rows = Import-Csv -Path $CsvPath -Delimiter ';'

function FixCoord {
  param([string]$s)
  if ($null -eq $s) { return $s }
  $x = "$s".Trim()
  if ($x.StartsWith("'")) { $x = $x.Substring(1) }
  $x = $x.Trim()
  # Pattern like 52,4630,00 -> remove trailing ,00 and convert first comma to dot
  if ($x -match '^([0-9]+),([0-9]+),00$') { return "$($matches[1]).$($matches[2])" }
  # Remove trailing ,00 if present
  $x = $x -replace ',00$',''
  # If there are multiple commas, treat first as decimal separator and remove others
  $commaCount = ($x -split ',').Count - 1
  if ($commaCount -gt 0) {
    $idx = $x.IndexOf(',')
    if ($idx -ge 0) {
      $before = $x.Substring(0,$idx)
      $after = $x.Substring($idx+1) -replace ',',''
      return "$before.$after"
    }
  }
  # Replace single comma with dot
  if ($x -match ',') { $x = $x -replace ',','.' }
  # Remove any stray non-numeric except dot, sign, exponent
  $x = $x -replace '[^0-9\.\-+eE]',''
  return $x
}

$changed = 0

foreach ($row in $rows) {
  $origLat = $null
  $origLon = $null
  if ($row.PSObject.Properties['latitude']) { $origLat = $row.latitude }
  if ($row.PSObject.Properties['longitude']) { $origLon = $row.longitude }
  # If latitude/longitude are missing, try swapped columns
  if ((-not $origLat -or -not $origLon) -and $row.PSObject.Properties['longitude'] -and $row.PSObject.Properties['latitude']) {
    $origLat = $row.longitude
    $origLon = $row.latitude
  }
  if ($origLat -ne $null) {
    $fixedLat = FixCoord $origLat
  } else { $fixedLat = $null }
  if ($origLon -ne $null) {
    $fixedLon = FixCoord $origLon
  } else { $fixedLon = $null }

  if ($fixedLat -ne $null -and $fixedLat -ne $origLat) {
    if ($row.PSObject.Properties['latitude']) { $row.latitude = $fixedLat } else { $row.longitude = $fixedLat }
    $changed++
    Write-Host "Fixed lat for ID=$($row.ID) Title=$($row.title): '$origLat' -> '$fixedLat'"
  }
  if ($fixedLon -ne $null -and $fixedLon -ne $origLon) {
    if ($row.PSObject.Properties['longitude']) { $row.longitude = $fixedLon } else { $row.latitude = $fixedLon }
    $changed++
    Write-Host "Fixed lon for ID=$($row.ID) Title=$($row.title): '$origLon' -> '$fixedLon'"
  }
}

if ($changed -gt 0) {
  $rows | Export-Csv -Path $CsvPath -Delimiter ';' -NoTypeInformation -Encoding UTF8
  Write-Host "Updated $CsvPath ($changed changes)."
} else {
  Write-Host "No changes needed."}
