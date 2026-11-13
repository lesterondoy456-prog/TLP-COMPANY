# Run in Administrator PowerShell if Windows Firewall blocks LAN clients.
# This rule is limited to this app's TCP port and the local subnet.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$ruleName = 'TLP-Company-Sales-5189'
if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name $ruleName `
        -DisplayName 'TLP Company SalesSystem LAN 5189' `
        -Direction Inbound -Action Allow -Protocol TCP `
        -LocalPort 5189 -RemoteAddress LocalSubnet -Profile Any | Out-Null
}
Get-NetFirewallRule -Name $ruleName | Select-Object Name, Enabled, Direction, Action
