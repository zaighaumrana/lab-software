param([Parameter(Mandatory=$true)][string]$BackupPath,[string]$TargetDatabase,[string]$TargetArtifactRoot,
      [switch]$VerifyOnly,[string]$PostgresBin,[switch]$AllowOperationalRestore,[string]$ConfirmOperationalRestore)
$ErrorActionPreference='Stop'
if(-not $VerifyOnly -and (-not $TargetDatabase -or -not $TargetArtifactRoot)){throw 'Specify a new target database and a new artifact root'}
$restoreArgs=@("$PSScriptRoot/backup-recovery.cjs",'restore','--backupPath',$BackupPath)
if($VerifyOnly){$restoreArgs+='--verifyOnly'}
else{$restoreArgs+=@('--targetDatabase',$TargetDatabase,'--targetArtifactRoot',$TargetArtifactRoot)}
if($PostgresBin){$restoreArgs+=@('--pgBin',$PostgresBin)}
if($AllowOperationalRestore){$restoreArgs+='--allowOperationalRestore'}
if($ConfirmOperationalRestore){$restoreArgs+=@('--confirmOperationalRestore',$ConfirmOperationalRestore)}
& node @restoreArgs
if($LASTEXITCODE -ne 0){throw 'LabFlow restore/verification failed; do not start a partial restored installation'}
