# Graba SOLO la ventana del VS Code de pruebas, a unos 5 fotogramas por segundo, hasta que aparece el fichero-bandera.
# Nunca la pantalla: PrintWindow sobre la ventana, aunque esté tapada. Así no se cuela nada del escritorio.
param([string]$Carpeta, [string]$Bandera, [int]$Ancho = 1440, [int]$Alto = 860, [int]$Max = 600)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class VkRec {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
}
'@
New-Item -ItemType Directory -Force $Carpeta | Out-Null
$p = $null
for ($i = 0; $i -lt 120 -and -not $p; $i++) {
  $p = Get-Process | Where-Object { $_.MainWindowTitle -like '*Extension Development Host*' } | Select-Object -First 1
  if (-not $p) { Start-Sleep -Milliseconds 250 }
}
if (-not $p) { Write-Output 'no hay ventana de pruebas'; exit 1 }
$h = $p.MainWindowHandle
[void][VkRec]::MoveWindow($h, 20, 20, $Ancho, $Alto, $true)
Start-Sleep -Milliseconds 600
$n = 0
while ($n -lt $Max -and -not (Test-Path $Bandera) -and [VkRec]::IsWindow($h)) {
  $r = New-Object VkRec+RECT
  [void][VkRec]::GetWindowRect($h, [ref]$r)
  $w = $r.R - $r.L; $hh = $r.B - $r.T
  if ($w -gt 100 -and $hh -gt 100) {
    $bmp = New-Object System.Drawing.Bitmap $w, $hh
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $dc = $g.GetHdc()
    [void][VkRec]::PrintWindow($h, $dc, 2)
    $g.ReleaseHdc($dc)
    $bmp.Save((Join-Path $Carpeta ('f{0:D5}.png' -f $n)), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    $n++
  }
  Start-Sleep -Milliseconds 150
}
Write-Output "fotogramas: $n"
