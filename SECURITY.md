# Security

## Reporting a vulnerability

Please report it privately through [GitHub's private vulnerability reporting](https://github.com/getcutpro/mcp/security/advisories/new), not in a public issue. Include what is affected, how to reproduce it and the impact you see. We answer within two business days and keep you posted until it is fixed.

## Supported versions

Only the latest release receives fixes. Local installs move to it on their own (see Updates in the README), and the hosted server at `https://mcp.cut.pro` always runs it.

## Scope

This server holds no data of its own: every call goes to the CutPro API with the caller's key or OAuth token, under that workspace's permissions. Reports about the API or cut.pro itself are welcome through the same channel.
