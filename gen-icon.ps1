# Generate app icon: rounded cyan square + white lightbulb, 256x256 PNG
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 14, 116, 144))
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

# rounded-rect background (corner radius 48)
$p = New-Object System.Drawing.Drawing2D.GraphicsPath
$p.AddArc(0, 0, 96, 96, 180, 90)
$p.AddArc(160, 0, 96, 96, 270, 90)
$p.AddArc(160, 160, 96, 96, 0, 90)
$p.AddArc(0, 160, 96, 96, 90, 90)
$p.CloseFigure()
$g.FillPath($bg, $p)

# bulb circle
$g.FillEllipse($white, 78, 48, 100, 100)
# neck
$g.FillRectangle($white, 108, 146, 40, 30)
# base (rounded rect, radius 12)
$p2 = New-Object System.Drawing.Drawing2D.GraphicsPath
$p2.AddArc(86, 174, 24, 24, 180, 90)
$p2.AddArc(146, 174, 24, 24, 270, 90)
$p2.AddArc(146, 180, 24, 24, 0, 90)
$p2.AddArc(86, 180, 24, 24, 90, 90)
$p2.CloseFigure()
$g.FillPath($white, $p2)
# base ridges
$g.FillRectangle($bg, 96, 184, 64, 3)
$g.FillRectangle($bg, 96, 193, 64, 3)

$bmp.Save('D:\VScode\vibeCodingProgram\assets\icon.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output 'icon saved'
