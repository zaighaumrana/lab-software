param([Parameter(Mandatory=$true)][string]$Destination,[int]$RetentionDays=0,[string]$PostgresBin,[switch]$Status)
$ErrorActionPreference='Stop'
$backupArgs=@("$PSScriptRoot/backup-recovery.cjs",$(if($Status){'status'}else{'backup'}),'--destination',$Destination)
if($RetentionDays -gt 0){$backupArgs+=@('--retentionDays',"$RetentionDays")}
elseif($RetentionDays -lt 0){throw 'RetentionDays must be zero or positive'}
if($PostgresBin){$backupArgs+=@('--pgBin',$PostgresBin)}
& node @backupArgs
if($LASTEXITCODE -ne 0){throw 'LabFlow backup/status failed; no failed package is considered completed'}
