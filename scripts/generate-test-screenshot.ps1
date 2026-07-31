param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$ScreenshotDirectory = Join-Path $ProjectRoot 'screenshots'
$ScreenshotPath = Join-Path $ScreenshotDirectory '04-level3-test-output.png'
New-Item -ItemType Directory -Path $ScreenshotDirectory -Force | Out-Null

$previousForceColor = $env:FORCE_COLOR
$previousNoColor = $env:NO_COLOR
$env:FORCE_COLOR = '0'
$env:NO_COLOR = '1'

Push-Location $ProjectRoot
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    $testOutput = @(
        & cmd.exe /d /s /c 'npm test -- --reporter=verbose' 2>&1
    )
    $testExitCode = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousErrorActionPreference
    Pop-Location
    $env:FORCE_COLOR = $previousForceColor
    $env:NO_COLOR = $previousNoColor
}

if ($testExitCode -ne 0) {
    throw "The test suite failed with exit code $testExitCode."
}

$ansiPattern = "$([char]27)\[[0-?]*[ -/]*[@-~]"
$cleanOutput = @(
    $testOutput |
        ForEach-Object { ([string]$_ -replace $ansiPattern, '').TrimEnd() }
)

$summaryFiles = $cleanOutput |
    Where-Object { $_ -match '^\s*Test Files\s+\d+\s+passed' } |
    Select-Object -Last 1
$summaryTests = $cleanOutput |
    Where-Object { $_ -match '^\s*Tests\s+\d+\s+passed' } |
    Select-Object -Last 1
$summaryDuration = $cleanOutput |
    Where-Object { $_ -match '^\s*Duration\s+' } |
    Select-Object -Last 1

if (-not $summaryFiles -or -not $summaryTests) {
    throw 'Vitest pass summaries were not found in the command output.'
}

if ($summaryTests -notmatch 'Tests\s+(?<Passed>\d+)\s+passed') {
    throw 'The number of passing tests could not be parsed.'
}
$passingTestCount = [int]$Matches.Passed
if ($passingTestCount -lt 3) {
    throw "Submission evidence requires at least 3 passing tests; found $passingTestCount."
}

$testLines = @(
    $cleanOutput |
        Where-Object {
            $_ -match 'tests[\\/].+\s+>\s+.+' -and $_ -match '\d+ms\s*$'
        }
)

$displayTests = @()
foreach ($line in ($testLines | Select-Object -First 9)) {
    if (
        $line -match
        '(?<File>tests[\\/][^>]+)\s+>\s+(?<Suite>[^>]+)\s+>\s+(?<Test>.+?)\s+\d+ms\s*$'
    ) {
        $display = "[PASS] $($Matches.File.Trim()) > $($Matches.Test.Trim())"
        if ($display.Length -gt 112) {
            $display = "$($display.Substring(0, 109))..."
        }
        $displayTests += $display
    }
}

if ($displayTests.Count -lt 3) {
    throw 'Fewer than three named passing tests were available for the screenshot.'
}

$remainingTests = $passingTestCount - $displayTests.Count

$width = 1600
$height = 1000
$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$background = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#07110F')
)
$topBar = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#0C1B17')
)
$panel = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#030C0A')
)
$borderPen = [System.Drawing.Pen]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#24443A'),
    2
)

$graphics.FillRectangle($background, 0, 0, $width, $height)
$graphics.FillRectangle($topBar, 0, 0, $width, 86)
$graphics.FillRectangle($panel, 42, 122, 1516, 790)
$graphics.DrawRectangle($borderPen, 42, 122, 1516, 790)

foreach ($circle in @(
    @{ X = 34; Color = '#FF6B6B' },
    @{ X = 70; Color = '#FFD166' },
    @{ X = 106; Color = '#51E3A4' }
)) {
    $circleBrush = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml($circle.Color)
    )
    $graphics.FillEllipse($circleBrush, $circle.X, 31, 20, 20)
    $circleBrush.Dispose()
}

$titleFont = [System.Drawing.Font]::new('Segoe UI Semibold', 22)
$badgeFont = [System.Drawing.Font]::new('Segoe UI Semibold', 14)
$terminalFont = [System.Drawing.Font]::new('Consolas', 18)
$summaryFont = [System.Drawing.Font]::new('Consolas', 21, [System.Drawing.FontStyle]::Bold)
$footerFont = [System.Drawing.Font]::new('Segoe UI', 12)

$titleBrush = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#F4FBF8')
)
$outputBrush = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#D8E8E1')
)
$promptBrush = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#83F3C8')
)
$successBrush = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#74EAB7')
)
$mutedBrush = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#789087')
)
$badgeBrush = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml('#1F6A50')
)
$badgeTextBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)

$graphics.DrawString(
    'Midnight Private Counter - Level 3 test evidence',
    $titleFont,
    $titleBrush,
    150,
    22
)
$graphics.FillRectangle($badgeBrush, 1330, 23, 200, 40)
$badgeFormat = [System.Drawing.StringFormat]::new()
$badgeFormat.Alignment = [System.Drawing.StringAlignment]::Center
$badgeFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString(
    'EXIT 0',
    $badgeFont,
    $badgeTextBrush,
    [System.Drawing.RectangleF]::new(1330, 23, 200, 40),
    $badgeFormat
)

$y = 150
$graphics.DrawString(
    'PS> npm test -- --reporter=verbose',
    $terminalFont,
    $promptBrush,
    72,
    $y
)
$y += 46
$graphics.DrawString(
    'RUN  v4.1.10  Midnight_Project',
    $terminalFont,
    $mutedBrush,
    72,
    $y
)
$y += 52

foreach ($line in $displayTests) {
    $graphics.DrawString($line, $terminalFont, $successBrush, 72, $y)
    $y += 43
}

if ($remainingTests -gt 0) {
    $graphics.DrawString(
        "... $remainingTests additional passing tests",
        $terminalFont,
        $mutedBrush,
        72,
        $y
    )
    $y += 52
}

$graphics.DrawLine($borderPen, 72, $y, 1525, $y)
$y += 28
$graphics.DrawString($summaryFiles.Trim(), $summaryFont, $outputBrush, 72, $y)
$y += 48
$graphics.DrawString($summaryTests.Trim(), $summaryFont, $successBrush, 72, $y)
$y += 48
$graphics.DrawString($summaryDuration.Trim(), $terminalFont, $mutedBrush, 72, $y)

$timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss K')
$graphics.DrawString(
    "Fresh local Vitest run - $timestamp",
    $footerFont,
    $mutedBrush,
    48,
    950
)

$bitmap.Save($ScreenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)

$badgeFormat.Dispose()
$titleFont.Dispose()
$badgeFont.Dispose()
$terminalFont.Dispose()
$summaryFont.Dispose()
$footerFont.Dispose()
$titleBrush.Dispose()
$outputBrush.Dispose()
$promptBrush.Dispose()
$successBrush.Dispose()
$mutedBrush.Dispose()
$badgeBrush.Dispose()
$badgeTextBrush.Dispose()
$background.Dispose()
$topBar.Dispose()
$panel.Dispose()
$borderPen.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $ScreenshotPath
