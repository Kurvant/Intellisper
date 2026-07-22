# Broken links carried out of M3 — 3 editorial decisions for C1

The M3 port produced **exactly 3 broken internal links** across 128 pages. None is a port bug: each
points at content that is deliberately absent from the public site. They need an editorial call, not a
script fix, so they are recorded here rather than papered over.

`onBrokenLinks` is temporarily `'warn'` in `docs-site/docusaurus.config.ts` to keep the migration
build verifiable. **It must return to `'throw'` at the C6 cutover** — the C6 gate asserts this.

| # | Source page | Link | Why it breaks | Decision needed |
|---|---|---|---|---|
| 1 | `about/changelog:132` | `/handbook/engineering/onboarding/release-cycle` | Handbook is **withheld** from the public site (page-map §2b — compensation, postmortems, internal playbooks) | Rewrite the sentence, drop the link, or publish just that one page? |
| 2 | `embedding/predefined-connection:13` | `/handbook/engineering/playbooks/run-ee` | Same — a public page tells readers to "Run the Enterprise Edition" and links to an **internal** playbook | Likely needs a public EE-setup page, or point at the Deploy tab |
| 3 | `install/configuration/breaking-changes:17` | `/endpoints/embedding/add-allowed-embed-origins` | One of the **54 deferred OpenAPI stubs**; the plugin regenerates the API tab in M4, which is currently **blocked** (stale spec) | Resolves itself once M4 lands — re-check then; only needs a decision if the endpoint is dropped |

## Why this matters beyond the links
Items 1 and 2 are the *predicted* consequence of withholding the Handbook: public pages were written
assuming internal docs are public. That is a content-integrity finding, not a link-tidying chore —
the Handbook exclusion is correct, so the **public copy** has to change.
