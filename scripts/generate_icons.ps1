Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\FAYAS\.gemini\antigravity\brain\92545350-cafa-44b5-aaf8-e3391b6f4aeb\zigo_notes_logo_1791130826007.jpg'
$outDir = Join-Path $PSScriptRoot '..\public\images'

$src = [System.Drawing.Image]::FromFile($srcPath)

function Resize-ImageParam {
    param(
        [int]$Width,
        [int]$Height,
        [string]$OutFileName
    )
    $outPath = Join-Path $outDir $OutFileName
    $dest = New-Object System.Drawing.Bitmap($Width, $Height)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $Width, $Height)
    $dest.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
    Write-Host "Generated $OutFileName ($Width x $Height)"
}

Resize-ImageParam -Width 512 -Height 512 -OutFileName 'icon-512.png'
Resize-ImageParam -Width 192 -Height 192 -OutFileName 'icon-192.png'
Resize-ImageParam -Width 192 -Height 192 -OutFileName 'favicon.png'
Resize-ImageParam -Width 180 -Height 180 -OutFileName 'apple-touch-icon.png'
Resize-ImageParam -Width 192 -Height 192 -OutFileName 'icon-maskable-192.png'
Resize-ImageParam -Width 512 -Height 512 -OutFileName 'icon-maskable-512.png'
Resize-ImageParam -Width 1024 -Height 1024 -OutFileName 'zigo-logo.png'
Resize-ImageParam -Width 1024 -Height 1024 -OutFileName 'zoho-logo.png'

$src.Dispose()
Write-Host "All PWA logo icons generated successfully!"
