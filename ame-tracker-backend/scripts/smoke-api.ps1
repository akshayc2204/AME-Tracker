# Live API smoke against running backend (http://localhost:3000)
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3000/api'
$failures = @()
$passed = 0

function Assert-Ok($name, $cond, $detail = '') {
  if ($cond) {
    $script:passed++
    Write-Host "[OK] $name" -ForegroundColor Green
  } else {
    $script:failures += "$name $detail"
    Write-Host "[FAIL] $name $detail" -ForegroundColor Red
  }
}

function Invoke-Json($method, $url, $body = $null, $token = $null) {
  $headers = @{ Accept = 'application/json' }
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $params = @{ Method = $method; Uri = $url; Headers = $headers }
  if ($body -ne $null) {
    $params['ContentType'] = 'application/json'
    $params['Body'] = ($body | ConvertTo-Json -Compress)
  }
  return Invoke-RestMethod @params
}

Write-Host "`n=== AME Tracker API smoke ===`n"

try {
  $health = Invoke-Json GET "$base/health"
  Assert-Ok 'GET /health' ($health.success -eq $true -and $health.data.service -eq 'ame-tracker-api')
} catch {
  Assert-Ok 'GET /health' $false $_.Exception.Message
}

try {
  Invoke-RestMethod -Method GET -Uri "$base/dashboard" -Headers @{ Accept = 'application/json' } -ErrorAction Stop
  Assert-Ok 'GET /dashboard unauthenticated -> 401' $false 'expected 401'
} catch {
  $status = $_.Exception.Response.StatusCode.value__
  Assert-Ok 'GET /dashboard unauthenticated' ($status -eq 401) "got $status"
}

$adminToken = $null
$operatorToken = $null
try {
  $loginAdmin = Invoke-Json POST "$base/auth/login" @{ email = 'AME_admin'; password = 'Admin@123' }
  $adminToken = $loginAdmin.data.accessToken
  Assert-Ok 'POST /auth/login (ADMIN)' ($null -ne $adminToken -and $loginAdmin.data.user.role -eq 'ADMIN')
} catch {
  Assert-Ok 'POST /auth/login (ADMIN)' $false $_.Exception.Message
}

try {
  $loginOp = Invoke-Json POST "$base/auth/login" @{ email = 'Operator'; password = 'Operator@123' }
  $operatorToken = $loginOp.data.accessToken
  Assert-Ok 'POST /auth/login (OPERATOR)' ($null -ne $operatorToken -and $loginOp.data.user.role -eq 'OPERATOR')
} catch {
  Assert-Ok 'POST /auth/login (OPERATOR)' $false $_.Exception.Message
}

if ($adminToken) {
  try {
    $me = Invoke-Json GET "$base/auth/me" $null $adminToken
    Assert-Ok 'GET /auth/me (ADMIN)' ($me.success -and $me.data.email -eq 'AME_admin')
  } catch { Assert-Ok 'GET /auth/me (ADMIN)' $false $_.Exception.Message }

  foreach ($pair in @(
      @{ n = 'GET /dashboard'; u = "$base/dashboard" },
      @{ n = 'GET /projects'; u = "$base/projects" },
      @{ n = 'GET /jobs'; u = "$base/jobs" },
      @{ n = 'GET /products'; u = "$base/products?pageSize=5" },
      @{ n = 'GET /transits'; u = "$base/transits" },
      @{ n = 'GET /transits/grouped'; u = "$base/transits/grouped" },
      @{ n = 'GET /users'; u = "$base/users" },
      @{ n = 'GET /fabshop/status'; u = "$base/fabshop/status" }
    )) {
    try {
      $r = Invoke-Json GET $pair.u $null $adminToken
      Assert-Ok $pair.n ($r.success -eq $true)
    } catch { Assert-Ok $pair.n $false $_.Exception.Message }
  }

  try {
    $search = Invoke-Json GET "$base/products?search=14&pageSize=5" $null $adminToken
    $hasItems = $search.data.items -is [Array]
    Assert-Ok 'GET /products?search=14' ($search.success -and $hasItems)
  } catch { Assert-Ok 'GET /products?search=14' $false $_.Exception.Message }
}

if ($operatorToken) {
  foreach ($pair in @(
      @{ n = 'OPERATOR GET /products'; u = "$base/products?pageSize=3" },
      @{ n = 'OPERATOR GET /transits/grouped'; u = "$base/transits/grouped" },
      @{ n = 'OPERATOR GET /dashboard'; u = "$base/dashboard" }
    )) {
    try {
      $r = Invoke-Json GET $pair.u $null $operatorToken
      Assert-Ok $pair.n ($r.success -eq $true)
    } catch { Assert-Ok $pair.n $false $_.Exception.Message }
  }

  try {
    Invoke-Json GET "$base/users" $null $operatorToken
    Assert-Ok 'OPERATOR GET /users -> 403' $false 'expected forbidden'
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    Assert-Ok 'OPERATOR GET /users forbidden' ($status -eq 403) "got $status"
  }

  # Transit create + list (operator core flow)
  try {
    $t = Invoke-Json POST "$base/transits" @{ vehicleNumber = 'SMOKE-TEST-TRUCK' } $operatorToken
    $tid = $t.data.id
    Assert-Ok 'POST /transits create' ($t.success -and $null -ne $tid)
    if ($tid) {
      $one = Invoke-Json GET "$base/transits/$tid" $null $operatorToken
      Assert-Ok "GET /transits/$tid" ($one.success -and $one.data.status -in @('ACTIVE','OPEN'))
      $del = Invoke-Json DELETE "$base/transits/$tid" $null $operatorToken
      Assert-Ok 'DELETE /transits (cleanup)' ($del.success -eq $true)
    }
  } catch { Assert-Ok 'POST /transits create flow' $false $_.Exception.Message }
}

# Mobile proxy path via Metro (optional — same host as Expo log)
$metro = 'http://localhost:8081'
try {
  $mh = Invoke-RestMethod -Method GET -Uri "$metro/api/health" -Headers @{ Accept = 'application/json' } -TimeoutSec 5
  Assert-Ok 'Metro /api/health proxy' ($mh.success -eq $true)
} catch {
  Assert-Ok 'Metro /api/health proxy' $false '(optional) ' + $_.Exception.Message
}

Write-Host "`n--- Summary: $passed passed, $($failures.Count) failed ---`n"
if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}
exit 0