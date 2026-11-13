# Run in Administrator PowerShell if Windows Firewall blocks LAN clients.
# This rule is limited to the five application TCP ports and the local subnet.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$ruleName = 'TLP-Company-Systems-5188-5192'
if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name $ruleName `
        -DisplayName 'TLP Company independent systems LAN 5188-5192' `
        -Direction Inbound -Action Allow -Protocol TCP `
        -LocalPort 5188,5189,5190,5191,5192 -RemoteAddress LocalSubnet -Profile Any | Out-Null
}
Get-NetFirewallRule -Name $ruleName | Select-Object Name, Enabled, Direction, Action
