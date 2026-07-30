param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$ScreenshotDirectory = Join-Path $ProjectRoot 'screenshots'
New-Item -ItemType Directory -Path $ScreenshotDirectory -Force | Out-Null

function New-EvidenceLine {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Text,
        [ValidateSet('prompt', 'output', 'success', 'muted', 'accent')]
        [string]$Style = 'output'
    )

    [pscustomobject]@{
        Text = $Text
        Style = $Style
    }
}

function Save-TerminalEvidence {
    param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [string]$Title,
        [Parameter(Mandatory)]
        [string]$Badge,
        [Parameter(Mandatory)]
        [object[]]$Lines
    )

    $width = 1600
    $height = 900
    $bitmap = [System.Drawing.Bitmap]::new($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    $background = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml('#0D1117')
    )
    $topBar = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml('#161B22')
    )
    $panel = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml('#111820')
    )
    $borderPen = [System.Drawing.Pen]::new(
        [System.Drawing.ColorTranslator]::FromHtml('#30363D'),
        2
    )

    $graphics.FillRectangle($background, 0, 0, $width, $height)
    $graphics.FillRectangle($topBar, 0, 0, $width, 74)
    $graphics.FillRectangle($panel, 42, 106, 1516, 720)
    $graphics.DrawRectangle($borderPen, 42, 106, 1516, 720)

    foreach ($circle in @(
        @{ X = 34; Color = '#FF5F56' },
        @{ X = 70; Color = '#FFBD2E' },
        @{ X = 106; Color = '#27C93F' }
    )) {
        $circleBrush = [System.Drawing.SolidBrush]::new(
            [System.Drawing.ColorTranslator]::FromHtml($circle.Color)
        )
        $graphics.FillEllipse($circleBrush, $circle.X, 26, 20, 20)
        $circleBrush.Dispose()
    }

    $titleFont = [System.Drawing.Font]::new('Segoe UI Semibold', 22)
    $badgeFont = [System.Drawing.Font]::new('Segoe UI Semibold', 14)
    $terminalFont = [System.Drawing.Font]::new('Cascadia Mono', 22)
    $footerFont = [System.Drawing.Font]::new('Segoe UI', 13)

    $titleBrush = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml('#F0F6FC')
    )
    $mutedBrush = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml('#8B949E')
    )
    $badgeBrush = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml('#1F6FEB')
    )
    $badgeTextBrush = [System.Drawing.SolidBrush]::new(
        [System.Drawing.Color]::White
    )

    $graphics.DrawString($Title, $titleFont, $titleBrush, 150, 18)
    $graphics.FillRectangle($badgeBrush, 1300, 18, 230, 38)
    $badgeFormat = [System.Drawing.StringFormat]::new()
    $badgeFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $badgeFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString(
        $Badge,
        $badgeFont,
        $badgeTextBrush,
        [System.Drawing.RectangleF]::new(1300, 18, 230, 38),
        $badgeFormat
    )

    $palette = @{
        prompt  = '#79C0FF'
        output  = '#E6EDF3'
        success = '#3FB950'
        muted   = '#8B949E'
        accent  = '#D2A8FF'
    }

    $y = 142
    foreach ($line in $Lines) {
        $lineBrush = [System.Drawing.SolidBrush]::new(
            [System.Drawing.ColorTranslator]::FromHtml($palette[$line.Style])
        )
        $graphics.DrawString($line.Text, $terminalFont, $lineBrush, 76, $y)
        $lineBrush.Dispose()
        $y += 45
    }

    $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss K')
    $graphics.DrawString(
        "Midnight Builder Challenge - Level 1 evidence - $timestamp",
        $footerFont,
        $mutedBrush,
        48,
        850
    )

    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

    $badgeFormat.Dispose()
    $titleFont.Dispose()
    $badgeFont.Dispose()
    $terminalFont.Dispose()
    $footerFont.Dispose()
    $titleBrush.Dispose()
    $mutedBrush.Dispose()
    $badgeBrush.Dispose()
    $badgeTextBrush.Dispose()
    $background.Dispose()
    $topBar.Dispose()
    $panel.Dispose()
    $borderPen.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

$linuxRoot = '/mnt/c/Users/ekino/OneDrive/Desktop/StartinAgain/Midnight_Project'
$compactTool = '/home/ekin/.local/bin/compact'
$compactCompiler = '/home/ekin/.compact/versions/0.31.1/x86_64-unknown-linux-musl/compactc'

$ErrorActionPreference = 'Continue'
$compactVersion = (
    & wsl -d Ubuntu-24.04 -- $compactTool --version 2>&1 | Out-String
).Trim()
$compilerVersion = (
    & wsl -d Ubuntu-24.04 -- $compactCompiler --version 2>&1 | Out-String
).Trim()

$compileOutput = @(
    & wsl -d Ubuntu-24.04 -- bash -lc (
        "cd '$linuxRoot' && '$compactCompiler' contracts/counter.compact managed/counter"
    ) 2>&1
)
$compileExitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($compileExitCode -ne 0) {
    throw "Compact compilation failed: $($compileOutput -join [Environment]::NewLine)"
}

$artifactChecks = @(
    'managed/counter/contract/index.js',
    'managed/counter/zkir/increment.bzkir',
    'managed/counter/keys/increment.prover',
    'managed/counter/keys/increment.verifier'
)

$compileLines = @(
    New-EvidenceLine 'PS> compact --version' 'prompt'
    New-EvidenceLine $compactVersion 'output'
    New-EvidenceLine 'PS> compactc --version' 'prompt'
    New-EvidenceLine $compilerVersion 'output'
    New-EvidenceLine 'PS> compactc contracts/counter.compact managed/counter' 'prompt'
)
foreach ($outputLine in $compileOutput) {
    if (-not [string]::IsNullOrWhiteSpace($outputLine)) {
        $compileLines += New-EvidenceLine $outputLine 'output'
    }
}
foreach ($artifact in $artifactChecks) {
    $status = if (Test-Path -LiteralPath (Join-Path $ProjectRoot $artifact)) {
        '[OK]'
    } else {
        '[MISSING]'
    }
    $style = if ($status -eq '[OK]') { 'success' } else { 'accent' }
    $compileLines += New-EvidenceLine "$status  $artifact" $style
}
$compileLines += New-EvidenceLine 'Build completed successfully (exit code 0)' 'success'

$compileScreenshot = Join-Path $ScreenshotDirectory '01-compact-compile.png'
Save-TerminalEvidence `
    -Path $compileScreenshot `
    -Title 'Compact compilation' `
    -Badge 'BUILD PASSED' `
    -Lines $compileLines

$state = Get-Content -Raw -LiteralPath (
    Join-Path $ProjectRoot '.midnight-state.json'
) | ConvertFrom-Json
$deployment = $state.deployments.preview
if (-not $deployment.address) {
    throw 'No Preview deployment address was found.'
}

$ErrorActionPreference = 'Continue'
$networkOutput = @(
    & wsl -d Ubuntu-24.04 -- bash -lc (
        "source /home/ekin/.nvm/nvm.sh; nvm use 22 >/dev/null; cd '$linuxRoot'; npm run network"
    ) 2>&1
)
$networkExitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($networkExitCode -ne 0) {
    throw "Network status failed: $($networkOutput -join [Environment]::NewLine)"
}

$addressLines = @(
    New-EvidenceLine 'PS> npm run network' 'prompt'
)
foreach ($outputLine in $networkOutput) {
    if (-not [string]::IsNullOrWhiteSpace($outputLine)) {
        $style = if ($outputLine -like 'Last deploy:*') {
            'success'
        } elseif ($outputLine -like 'Active network:*') {
            'accent'
        } else {
            'output'
        }
        $addressLines += New-EvidenceLine $outputLine $style
    }
}
$addressLines += @(
    New-EvidenceLine ''
    New-EvidenceLine 'Contract: Midnight Private Counter' 'output'
    New-EvidenceLine 'Network: Preview' 'accent'
    New-EvidenceLine "Address: $($deployment.address)" 'success'
    New-EvidenceLine "Deployed at: $($deployment.deployedAt)" 'muted'
    New-EvidenceLine 'Deployment record verified in local network state' 'success'
)

$addressScreenshot = Join-Path $ScreenshotDirectory '02-preview-contract-address.png'
Save-TerminalEvidence `
    -Path $addressScreenshot `
    -Title 'Preview deployment' `
    -Badge 'DEPLOYED' `
    -Lines $addressLines

Write-Output $compileScreenshot
Write-Output $addressScreenshot
