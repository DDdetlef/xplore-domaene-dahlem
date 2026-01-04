param(
  [string]$CsvPath = "data/poi.csv",
  [string]$OutPath = "data/poi.geojson"
)

if (!(Test-Path -Path $CsvPath)) {
  Write-Error "CSV not found: $CsvPath"
  exit 1
}

$rows = Import-Csv -Path $CsvPath -Delimiter ';'

function GetVal {
  param($row, [string[]]$keys)
  foreach ($k in $keys) {
    if ($row.PSObject.Properties[$k]) {
      $v = $row.$k
      if ($null -ne $v -and "$v" -ne "") { return "$v" }
    }
  }
  return $null
}

function SplitList {
  param([string]$s)
  if ([string]::IsNullOrWhiteSpace($s)) { return @() }
  return ($s -split '[;,]') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
}

$features = @()

foreach ($row in $rows) {
  $latS = GetVal $row @('lat','latitude','y')
  $lonS = GetVal $row @('lon','long','lng','x','longitude')
  # Handle mislabeled columns where 'longitude' actually contains latitude and 'latitude' contains longitude
  if ((-not $latS -or -not $lonS) -and $row.PSObject.Properties['longitude'] -and $row.PSObject.Properties['latitude']) {
    $latS = $row.longitude
    $lonS = $row.latitude
  }
  if (-not $latS -or -not $lonS) { continue }
  try { $lat = [double]::Parse($latS, [System.Globalization.CultureInfo]::InvariantCulture) } catch { continue }
  try { $lon = [double]::Parse($lonS, [System.Globalization.CultureInfo]::InvariantCulture) } catch { continue }
  # Heuristic swap for Berlin-area data if columns are mislabeled
  if ($lat -lt 30 -and $lon -gt 30) { $tmp = $lat; $lat = $lon; $lon = $tmp }

  $props = @{}
  $title = GetVal $row @('title','name')
  if ($title) { $props.title = $title }
  $title_en = GetVal $row @('title_en','name_en')
  if ($title_en) { $props.title_en = $title_en }
  $desc = GetVal $row @('desc','description')
  if ($desc) { $props.desc = $desc }
  $desc_en = GetVal $row @('desc_en','description_en','text_en')
  if ($desc_en) { $props.desc_en = $desc_en }
  $address = GetVal $row @('address')
  if ($address) { $props.address = $address }
  $hours = GetVal $row @('hours','opening_hours')
  if ($hours) { $props.hours = $hours }
  $website = GetVal $row @('website','link','url')
  if ($website) { $props.website = $website }
  $category = GetVal $row @('category','subject')
  if ($category) { $props.category = $category }
  $subject_en = GetVal $row @('subject_en')
  if ($subject_en) { $props.subject_en = $subject_en }
  $tagsS = GetVal $row @('tags')
  if ($tagsS) { $props.tags = SplitList $tagsS }
  $photosS = GetVal $row @('photos','images')
  if ($photosS) {
    $urls = SplitList $photosS
    $props.photos = @()
    foreach ($u in $urls) { $props.photos += @{ url = $u } }
  }
  $funfact = GetVal $row @('funfact')
  if ($funfact) { $props.funfact = $funfact }
  $funfact_en = GetVal $row @('funfact_en')
  if ($funfact_en) { $props.funfact_en = $funfact_en }

  $feature = @{ type = 'Feature'; properties = $props; geometry = @{ type = 'Point'; coordinates = @($lon, $lat) } }
  $features += $feature
}

$fc = @{ type = 'FeatureCollection'; features = $features }

$Json = $fc | ConvertTo-Json -Depth 8
Set-Content -Path $OutPath -Value $Json -Encoding UTF8
Write-Host "Wrote $OutPath with $($features.Count) features."
