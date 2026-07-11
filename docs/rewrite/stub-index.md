# Stub Index

Running index of every clean-room scaffolding STUB introduced during the EE-removal
build-green effort. Each must be replaced by a real clean-room implementation before the
corresponding feature is considered done. Search the codebase for `STUB` to find them.

| # | Path | Symbol | Temporary behavior | Real behavior (spec ref) | Edition seam |
|---|------|--------|--------------------|--------------------------|--------------|
| 1 | `app/enterprise/license-keys/license-keys-module.ts` | `licenseKeysModule` | `POST /v1/license-keys/verify` accepts (platform-admin) and returns 200; grants NO entitlement, no validation | Tamper-resistant entitlement verification + plan application (capability spec **G.4**) | Registered for all editions (unconditional); behavior gated by real entitlement later |
| 2 | `app/enterprise/authentication/project-role/rbac-service.ts` | `rbacService().assertPrinicpalAccessToProject` | Edition-aware: ENGINE→bound-project check; COMMUNITY→pass-through; ENTERPRISE/CLOUD→**deny (fail-safe)** | Real role resolution + permission check, deny-by-default (capability spec **I.3/I.4**) | Edition-gated; enterprise/cloud branch must be completed before sale |
| 3 | `app/enterprise/authentication/project-role/rbac-middleware.ts` | `assertUserHasPermissionToFlow`, `assertRoleHasPermission`, `getPrincipalRoleOrThrow`, `rbacMiddleware` | Edition-aware: COMMUNITY→pass-through; ENTERPRISE/CLOUD→deny/throw (fail-safe). `rbacMiddleware` hook is a no-op (authz enforced in authorize.ts). | Real flow/role permission checks + role resolution (spec **I.3/I.4**) | Edition-gated; complete enterprise/cloud before sale |
| 4 | `app/enterprise/authentication/ee-authorization.ts` | `platformMustBeOwnedByCurrentUser`, `platformToEditMustBeOwnedByCurrentUser`, `projectMustBeTeamType`, `platformMustHaveFeatureEnabled` | Ownership guards = REAL (PlatformRole.ADMIN check, from MIT model); feature-flag guard = REAL (reads plan); `projectMustBeTeamType` = STUB (community pass-through / enterprise fail-safe deny) | Real team-project gating for enterprise (spec C.1/C.4) | Ownership + feature guards production-real; team-type gating stubbed |

> Conventions: stub files start with `// STUB (clean-room scaffolding) — …`; stubbed
> functions carry inline `// STUB:` comments. Security seams (authorization/tenant scoping)
> are NEVER stubbed permissively — they get real deny-by-default base behavior.
