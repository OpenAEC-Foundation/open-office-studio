# Pure ownership predicate tests only. Extract this one function through AST;
# never evaluate the UI driver or instantiate/call UIA/Win32 on a local host.
$ErrorActionPreference='Stop'
$driver=Join-Path $PSScriptRoot 'epub356-final-windows-save.ps1'
$tokens=$null; $parseErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($driver,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
$function=$ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Test-OwnedNativeFilenameFacts'},$true)
if ($function.Count -ne 1) { throw 'Unique pure ownership predicate required' }
Invoke-Expression $function[0].Extent.Text
$good=@{focused=$true;enabled=$true;handle=123;pid=456;className='Edit';controlId=1001;dialogHandle=789;dialogClass='#32770';allAncestorsOwned=$true;fileNameHost=$true;text='leesvolgorde'}
if (-not (Test-OwnedNativeFilenameFacts $good 456 789 @('leesvolgorde','leesvolgorde.docx'))) { throw 'Actual native Edit facts must be accepted' }
$badFacts=@{focused=$false;enabled=$false;handle=0;pid=999;className='Chrome_RenderWidgetHostHWND';controlId=1002;dialogHandle=999;dialogClass='WebView';allAncestorsOwned=$false;fileNameHost=$false;text='other-document'}
foreach ($key in $badFacts.Keys) {
    $facts=$good.Clone(); $facts[$key]=$badFacts[$key]
    if (Test-OwnedNativeFilenameFacts $facts 456 789 @('leesvolgorde','leesvolgorde.docx')) { throw "Unsafe fact accepted: $key" }
}
$saved=$good.Clone();$saved.text='D:\isolated\leesvolgorde.docx'
if (-not (Test-OwnedNativeFilenameFacts $saved 456 789 @('D:\isolated\leesvolgorde.docx'))) { throw 'Exact path readback must be accepted' }
if (Test-OwnedNativeFilenameFacts $saved 456 789 @('D:\other\leesvolgorde.docx')) { throw 'Different path must fail' }
$declaration=$ast.FindAll({param($node) $node -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $node.Value.Contains('public static class Epub356NativeField')},$true)
if ($declaration.Count -ne 1) { throw 'Unique Win32 declaration required' }
# Compile declarations only; P/Invoke resolves/calls user32 only when invoked.
# No declared method is invoked by this contract test.
Add-Type -TypeDefinition $declaration[0].Value
Write-Output '14 pure native filename ownership/readback cases and C# declaration compilation passed; UIA/Win32 not executed.'
