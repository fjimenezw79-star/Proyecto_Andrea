# Crea los accesos directos de Modas Andrea en el escritorio (lo usan instalar.bat y crear_accesos_directos.bat).
# Solo texto ASCII: Windows PowerShell 5 lee los .ps1 sin BOM como ANSI.
param([string]$Dir)
$ErrorActionPreference = 'Stop'
$dir = (Resolve-Path -LiteralPath $Dir).Path.TrimEnd('\')

# Escritorio del usuario (tambien cuando esta en OneDrive); si no se encuentra, la carpeta Desktop del perfil
$desk = [Environment]::GetFolderPath('Desktop')
if (-not $desk -or -not (Test-Path -LiteralPath $desk)) { $desk = Join-Path $env:USERPROFILE 'Desktop' }
if (-not (Test-Path -LiteralPath $desk)) { New-Item -ItemType Directory -Path $desk | Out-Null }

$shell = New-Object -ComObject WScript.Shell
$links = @(
  @{ Name = 'Modas Andrea';            Target = 'aplicacion.bat';    Icon = 13; Desc = 'Iniciar Modas Andrea (red del negocio)' },
  @{ Name = 'Modas Andrea (internet)'; Target = 'acceso_remoto.bat'; Icon = 14; Desc = 'Modas Andrea con acceso desde internet y tienda en linea' }
)
$ok = 0
foreach ($l in $links) {
  try {
    $path = Join-Path $desk ($l.Name + '.lnk')
    $s = $shell.CreateShortcut($path)
    $s.TargetPath = Join-Path $dir $l.Target
    $s.WorkingDirectory = $dir
    $s.IconLocation = "$env:SystemRoot\System32\shell32.dll,$($l.Icon)"
    $s.Description = $l.Desc
    $s.Save()
    if (-not (Test-Path -LiteralPath $path)) { throw 'Windows no guardo el archivo.' }
    Write-Host ('        Acceso directo "' + $l.Name + '" creado en el escritorio.')
    $ok++
  } catch {
    Write-Host ('  [!] No se pudo crear "' + $l.Name + '": ' + $_.Exception.Message)
  }
}
Write-Host ('        Carpeta del escritorio: ' + $desk)
if ($ok -lt $links.Count) { exit 1 }
exit 0
