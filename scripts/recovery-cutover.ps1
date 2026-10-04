param([Parameter(Mandatory=$true)][string]$BackupPath,[Parameter(Mandatory=$true)][string]$TargetDatabase,
      [Parameter(Mandatory=$true)][string]$TargetArtifactRoot,[Parameter(Mandatory=$true)][string]$ConfirmCutover,
      [string]$PostgresBin,[switch]$AllowOperationalRestore,[string]$ConfirmOperationalRestore)
$ErrorActionPreference='Stop'
$cutoverArgs=@("$PSScriptRoot/backup-recovery.cjs",'cutover','--backupPath',$BackupPath,'--targetDatabase',$TargetDatabase,
              '--targetArtifactRoot',$TargetArtifactRoot,'--confirmCutover',$ConfirmCutover)
if($PostgresBin){$cutoverArgs+=@('--pgBin',$PostgresBin)}
if($AllowOperationalRestore){$cutoverArgs+='--allowOperationalRestore'}
if($ConfirmOperationalRestore){$cutoverArgs+=@('--confirmOperationalRestore',$ConfirmOperationalRestore)}
& node @cutoverArgs
if($LASTEXITCODE -ne 0){throw 'Recovery cutover failed; retain recovery mode and do not resume outbound work'}
