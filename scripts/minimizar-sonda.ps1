# Minimiza la ventana del VS Code de pruebas pasados unos segundos (P-51: la sincronización con la ventana tapada).
param([int]$Espera = 6)
Start-Sleep -Seconds $Espera
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class VkMin { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n); }
'@
$p = Get-Process | Where-Object { $_.MainWindowTitle -like '*Extension Development Host*' } | Select-Object -First 1
if (-not $p) { Write-Output 'no hay ventana de pruebas'; exit 1 }
[void][VkMin]::ShowWindow($p.MainWindowHandle, 6)
Write-Output "minimizada: $($p.MainWindowTitle)"
