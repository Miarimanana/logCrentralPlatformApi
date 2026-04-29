# install-agent.ps1
# Usage: powershell -ExecutionPolicy Bypass -File install-agent.ps1 -DeviceToken TOKEN -ServerUrl http://SERVEUR:4000
param(
    [Parameter(Mandatory=$true)][string]$DeviceToken,
    [Parameter(Mandatory=$true)][string]$ServerUrl
)

$ErrorActionPreference = "Stop"

# --- 1. Validation token ---
Write-Host "Verification du token..."
try {
    $DeviceInfo = Invoke-RestMethod -Uri "$ServerUrl/api/devices/by-token/$DeviceToken" -Method Get
} catch {
    Write-Error "Serveur inaccessible ou token invalide : $ServerUrl"
    exit 1
}

$DeviceId   = $DeviceInfo.deviceId
$TenantName = $DeviceInfo.tenantName

if (-not $DeviceId -or $DeviceId -eq "None") {
    Write-Error "Token invalide ou deviceId manquant"
    exit 1
}

$SyslogHost = "${TenantName}__${DeviceId}"
$ServerIp   = ([System.Uri]$ServerUrl).Host
$ServerPort = 514

Write-Host "Device   : $DeviceId"
Write-Host "Tenant   : $TenantName"
Write-Host "Serveur  : $ServerIp"
Write-Host "Hostname : $SyslogHost"

# --- 2. Télécharger et installer NXLog CE ---
$NxlogInstaller = "$env:TEMP\nxlog-ce.msi"
$NxlogUrl = "https://nxlog.co/system/files/products/files/348/nxlog-ce-3.2.2329.msi"

if (-not (Test-Path "C:\Program Files (x86)\nxlog\conf")) {
    Write-Host "Telechargement de NXLog CE..."
    Invoke-WebRequest -Uri $NxlogUrl -OutFile $NxlogInstaller -UseBasicParsing
    Write-Host "Installation de NXLog CE..."
    Start-Process msiexec.exe -ArgumentList "/i `"$NxlogInstaller`" /qn" -Wait
    Remove-Item $NxlogInstaller -Force
}

# --- 3. Ecrire la config NXLog ---
$NxlogConf = @"
## NXLog config - LogCentral Agent
## Auto-generated - do not edit manually

define ROOT C:\Program Files (x86)\nxlog

Moduledir %ROOT%\modules
CacheDir  %ROOT%\data
Pidfile   %ROOT%\data\nxlog.pid
SpoolDir  %ROOT%\data
LogFile   %ROOT%\data\nxlog.log

<Extension json>
    Module  xm_json
</Extension>

<Extension syslog>
    Module  xm_syslog
</Extension>

<Input eventlog>
    Module      im_msvistalog
    # Collecte les 3 canaux principaux Windows
    Query       <QueryList>\
                  <Query Id="0">\
                    <Select Path="Application">*</Select>\
                    <Select Path="System">*</Select>\
                    <Select Path="Security">*[System[(band(Keywords,13510798882111488))]]</Select>\
                  </Query>\
                </QueryList>
</Input>

<Output syslog_out>
    Module      om_udp
    Host        $ServerIp
    Port        $ServerPort
    Exec        \$Hostname = '$SyslogHost'; to_syslog_bsd();
</Output>

<Route eventlog_to_syslog>
    Path        eventlog => syslog_out
</Route>
"@

$ConfPath = "C:\Program Files (x86)\nxlog\conf\nxlog.conf"
$NxlogConf | Out-File -FilePath $ConfPath -Encoding utf8 -Force
Write-Host "Config ecrite : $ConfPath"

# --- 4. Demarrer le service NXLog ---
Write-Host "Demarrage du service NXLog..."
Stop-Service nxlog -ErrorAction SilentlyContinue
Start-Service nxlog
Set-Service  nxlog -StartupType Automatic

Write-Host "---"
Write-Host "Installation terminee."
Write-Host "Logs visibles : http://${ServerIp}:3000"
Write-Host "Query Loki    : {job=`"syslog`", device_id=`"$DeviceId`"}"