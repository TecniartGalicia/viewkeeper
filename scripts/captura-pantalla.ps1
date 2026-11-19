# Captura SOLO la ventana del VS Code de la sonda (por su título), aunque esté tapada por otras.
# Nunca la pantalla entera: en ella está lo que el usuario tenga abierto.
param([string]$Salida, [int]$Espera = 10)
Start-Sleep -Seconds $Espera
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class VkWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
}
'@
$p = Get-Process | Where-Object { $_.MainWindowTitle -like '*Extension Development Host*' } | Select-Object -First 1
if (-not $p) { Write-Output 'no hay ventana de la sonda'; exit 1 }
$r = New-Object VkWin+RECT
[void][VkWin]::GetWindowRect($p.MainWindowHandle, [ref]$r)
$w = $r.R - $r.L; $h = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[void][VkWin]::PrintWindow($p.MainWindowHandle, $hdc, 2)
$g.ReleaseHdc($hdc)
$bmp.Save($Salida, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "guardada $Salida (${w}x${h})"
