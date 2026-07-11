# Egress Proxy Module

## Summary
Loopback HTTP proxy that every block/code step is routed through when `IB_NETWORK_MODE=STRICT`. Provides SSRF protection by validating each request's resolved IPs against an allow-list before letting `proxy-chain` tunnel the traffic. In isolate execution modes it is paired with a kernel-level iptables lockdown so sandboxed processes have no other egress path. Built on `proxy-chain` (`Server`) listening on `127.0.0.1:<random port>`; started from `startEgressProxy()` in `packages/server/worker/src/lib/egress/proxy.ts`.

## Key Files
- `packages/server/worker/src/lib/egress/proxy.ts` — `proxy-chain` server + `prepareRequestFunction` allow-list check
- `packages/server/worker/src/lib/egress/lifecycle.ts` — `startEgressStack()` / `shutdownStack()`, wiring proxy + iptables lockdown
- `packages/server/worker/src/lib/egress/iptables-lockdown.ts` — kernel-level egress lockdown for isolate UIDs
- `packages/server/worker/src/lib/execute/create-sandbox-for-job.ts` — passes proxy port into each sandbox env (`proxyEnv()`, ~line 112)
- `packages/server/engine/src/lib/network/ssrf-guard.ts` — engine-side guard install (DNS + socket-connect + env-proxy-dispatcher)
- `packages/server/engine/src/lib/network/proxy-dispatcher.ts` — installs undici `EnvHttpProxyAgent` for native `fetch`
- `packages/blocks/common/src/lib/http/axios/axios-http-client.ts` — block-side `AxiosHttpClient` that wires `HttpProxyAgent` / `HttpsProxyAgent` and sets `config.proxy = false`

## Edition Availability
- Community (CE): available, off by default (`IB_NETWORK_MODE=UNRESTRICTED`)
- Enterprise (EE): same as CE
- Cloud: enabled with `IB_NETWORK_MODE=STRICT`; API host auto-added to the allow-list via `maybeStartProxyAllowingApiHost()`

## Domain Terms
- **`NETWORK_MODE`** — `UNRESTRICTED` (no proxy, no lockdown) vs `STRICT` (proxy started, lockdown applied in isolate modes)
- **`IB_SSRF_ALLOW_LIST`** — comma-separated IPs/CIDRs that bypass the egress `ssrfIpClassifier` block
- **`prepareRequestFunction`** — `proxy-chain` hook that runs before each tunnel/HTTP request; Intellisper uses it to resolve all A/AAAA records for the hostname and reject if any resolved IP is blocked
- **`iptables-lockdown`** — per-box UID firewall rule that forces all egress from the sandbox through the proxy's listen port

## Request Flow (STRICT mode)
1. Worker boots → `startEgressStack()` starts the loopback proxy and, in isolate modes, applies `iptables-lockdown`.
2. For each sandbox, `create-sandbox-for-job.ts` injects env so the block routes outbound HTTP through `127.0.0.1:<proxyPort>`.
3. Block's HTTP client sends traffic to the proxy; for HTTPS it must issue `CONNECT host:443` (the proxy is an HTTP proxy, not a TLS-terminating one).
4. `prepareRequestFunction` resolves the hostname, checks every IP against `ssrfIpClassifier`, and either allows the tunnel or throws `Egress blocked: <host>` (403).
5. `proxy-chain` establishes the upstream TCP connection via `direct()` and streams bytes both ways.

## Regression Note: HTTPS fails with `Only HTTP protocol is supported (was https:)`

### Symptom
In STRICT mode, any block that doesn't ship the post-PR-#12700 `AxiosHttpClient` fails on HTTPS targets (e.g. HTTP block v0.4.5 calling any `https://…` third-party API) with:

```json
{ "response": { "status": 400, "body": "Only HTTP protocol is supported (was https:)" }, "request": {} }
```

Thrown by `proxy-chain` at `server.js:391` when it receives a non-`CONNECT` request whose target is an absolute `https://…` URL.

### Root cause
PR #12700 (egress proxy) sets the standard `HTTP_PROXY` / `HTTPS_PROXY` / `http_proxy` / `https_proxy` env vars inside every sandbox (`create-sandbox-for-job.ts:112–124`). In the same PR, `AxiosHttpClient` was patched to read those vars, build `HttpProxyAgent` / `HttpsProxyAgent`, and set `config.proxy = false`. That patched client tunnels correctly (`CONNECT` → 200).

However, **blocks are not loaded from the monorepo** at runtime — the worker installs each block from npm into `cache/v11/common/blocks/…/node_modules` (`block-installer.ts:98–101`, `cache-paths.ts:14`) and mounts that read-only into the isolate sandbox. Published blocks pin older `blocks-common`:
- `@intelblocks/block-http@0.4.5` → `@intelblocks/blocks-common@0.2.15`
- `@intelblocks/block-zerobounce@latest` → `@intelblocks/blocks-common@0.11.6`

Neither ships the agent wiring. With no custom agents and `config.proxy` undefined, axios falls back to its built-in `proxy-from-env` path (`axios/lib/adapters/http.js:192–233`) which rewrites the request to the proxy host and emits `GET https://<target-host>/… HTTP/1.1` — no `CONNECT`. `proxy-chain` rejects with the 400.

Reproduced locally:
- Old-style axios + env vars → exact 400 error.
- New `AxiosHttpClient` (agents + `proxy: false`) → 200.
- Proposed fix (global `http`/`https.globalAgent`, no `HTTP_PROXY` env vars) + old-style axios → 200.

### Fix direction
Do the proxy wiring at the engine level, not via standard env vars:
1. Pass the proxy URL as `IB_EGRESS_PROXY_URL` from `create-sandbox-for-job.ts` instead of `HTTP_PROXY` / `HTTPS_PROXY`.
2. In the engine's `ssrf-guard` bootstrap, set `http.globalAgent = new HttpProxyAgent(url)` and `https.globalAgent = new HttpsProxyAgent(url)` so any axios/http caller without an explicit agent still tunnels via `CONNECT`.
3. Replace the undici `EnvHttpProxyAgent` dispatcher with `new ProxyAgent(IB_EGRESS_PROXY_URL)` to keep `fetch` proxied after removing the standard env vars.

This covers every already-published block (including third-party ones) without needing a mass republish of blocks-common consumers.
