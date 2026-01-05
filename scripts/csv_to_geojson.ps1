param(
  [string]$CsvPath = "data/poi.csv",
  [string]$OutPath = "data/poi.geojson"
)

if (!(Test-Path -Path $CsvPath)) {
  Write-Error "CSV not found: $CsvPath"
  exit 1
}

$rows = Import-Csv -Path $CsvPath -Delimiter ';'
Write-Host "Read $($rows.Count) CSV rows from $CsvPath"
$function:NormalizeText = {
  param([string]$s)
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  # Normalize Windows newlines and convert literal \n sequences back to real newlines
  $x = $s -replace "\r\n", "`n"
  $x = $x -replace "\\n", "`n"
  $x = $x.Trim()
  return $x
}

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
    $title_en = GetVal $row @('title_en','name_en')
    # Prefer explicit DE/EN text fields; fall back between languages to ensure DE completeness
    $text = GetVal $row @('text','desc','description')
    $text_en = GetVal $row @('text_en','desc_en','description_en')
    # Subject in DE/EN
    $subject = GetVal $row @('subject')
    $subject_en = GetVal $row @('subject_en')
    # Category (DE/EN)
    $category = GetVal $row @('category')
    $category_en = GetVal $row @('category_en')

    # Assign properties with DE-first, fallback to EN if DE missing
    if ($title -and "$title" -ne '') { $props.title = "$title" }
    elseif ($title_en -and "$title_en" -ne '') { $props.title = "$title_en" }
    if ($title_en -and "$title_en" -ne '') { $props.title_en = "$title_en" }

    if ($text -and "$text" -ne '') { $props.text = "$text" }
    elseif ($text_en -and "$text_en" -ne '') { $props.text = "$text_en" }
    if ($text_en -and "$text_en" -ne '') { $props.text_en = "$text_en" }

    if ($subject -and "$subject" -ne '') { $props.subject = "$subject" }
    elseif ($subject_en -and "$subject_en" -ne '') { $props.subject = "$subject_en" }
    if ($subject_en -and "$subject_en" -ne '') { $props.subject_en = "$subject_en" }

    if ($category -and "$category" -ne '') { $props.category = "$category" }
    elseif ($category_en -and "$category_en" -ne '') { $props.category = "$category_en" }
    if ($category_en -and "$category_en" -ne '') { $props.category_en = "$category_en" }
    $address = GetVal $row @('address')
    if ($address) { $props.address = $address }
    $hours = GetVal $row @('hours','opening_hours')
    if ($hours) { $props.hours = $hours }
    $website = GetVal $row @('website','link','url')
    if ($website) { $props.website = $website }
    $tagsS = GetVal $row @('tags')
    if ($tagsS) { $props.tags = SplitList $tagsS }
    $photosS = GetVal $row @('photos','images','image')
    if ($photosS) {
      $urls = @(SplitList $photosS)
      $props.photos = @()
      foreach ($u in $urls) { $props.photos += @{ url = $u } }
      # also expose first image as 'image' (handle single-string case)
      if ($urls -and ($urls | Measure-Object).Count -gt 0) {
        $firstUrl = ($urls | Select-Object -First 1)
        $props.image = "$firstUrl"
      }
    }
    $funfact = GetVal $row @('funfact')
    $funfact_en = GetVal $row @('funfact_en')
    if ($funfact -and "$funfact" -ne '') { $props.funfact = "$funfact" }
    elseif ($funfact_en -and "$funfact_en" -ne '') { $props.funfact = "$funfact_en" }
    if ($funfact_en -and "$funfact_en" -ne '') { $props.funfact_en = "$funfact_en" }

    $feature = @{ type = 'Feature'; properties = $props; geometry = @{ type = 'Point'; coordinates = @($lon, $lat) } }
    $features += $feature
  }

  $fc = @{ type = 'FeatureCollection'; features = $features }

  $Json = $fc | ConvertTo-Json -Depth 8
  Set-Content -Path $OutPath -Value $Json -Encoding UTF8
  Write-Host "Wrote $OutPath with $($features.Count) features."
