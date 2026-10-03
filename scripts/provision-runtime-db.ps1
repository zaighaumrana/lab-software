# Run from the repository root. Credentials stay in process memory and untracked .env.
param([switch]$GrantsOnly,[switch]$ConfigureAdminConnectionOnly)
$ErrorActionPreference = 'Stop'
if (-not $GrantsOnly -and -not $env:PROVISION_DATABASE_URL) {
    $adminUser = Read-Host 'PostgreSQL installation/admin account name'
    $securePassword = Read-Host 'PostgreSQL installation/admin password' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
        # Node reads the existing owner URL for host/port/database, replacing credentials privately.
        $env:PROVISION_ADMIN_USER = $adminUser
        $env:PROVISION_ADMIN_PASSWORD = $plainPassword
    } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer); $plainPassword = $null }
}
try {
    if ($ConfigureAdminConnectionOnly) { node "$PSScriptRoot/provision-runtime-db.cjs" --configure-admin }
    elseif ($GrantsOnly) { node "$PSScriptRoot/provision-runtime-db.cjs" --grants-only }
    else { node "$PSScriptRoot/provision-runtime-db.cjs" --write-runtime-env }
    if ($LASTEXITCODE -ne 0) { throw 'Runtime provisioning did not pass. API must not start in hardened mode until verification succeeds.' }
} finally {
    Remove-Item Env:PROVISION_ADMIN_USER -ErrorAction SilentlyContinue
    Remove-Item Env:PROVISION_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
