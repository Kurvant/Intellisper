// Clean-room implementation — integration availability governance (capability spec I.1).
//
// Per-organization control over which integrations ("blocks") are available to its workspaces,
// enforced BOTH when presenting the catalog (list) and when a single integration is resolved for
// use (get). Two independent, ANDed governance layers decide whether a block is available to a
// caller:
//
//   1. Organization (platform) filter — `filteredBlockBehavior` over `filteredBlockNames`:
//        • ALLOWED  → allow-list: only the named blocks are available; everything else is hidden.
//        • BLOCKED  → deny-list: the named blocks are hidden; everything else is available.
//      (Organization-private blocks — custom blocks owned by the platform — are made visible to
//      the platform and hidden from every other tenant upstream in the core block path via
//      `filterBlockBasedOnType`; that private-visibility layer is NOT re-implemented here.)
//
//   2. Workspace (project) filter — `blocksFilterType` over the project plan's `blocks`:
//        • NONE     → no workspace restriction.
//        • ALLOWED  → allow-list: only the named blocks are available in this workspace.
//
// A block is available only if BOTH layers allow it. Availability, not error, is the result:
// governance narrows the returned set; it never throws.
//
// COMMUNITY-CRITICAL (see RISK REGISTER): these run in the core block-metadata path in EVERY
// edition. With no governance configured (the base case — an empty BLOCKED deny-list and a NONE
// project filter) NOTHING is filtered, so the list is returned unchanged and `isFiltered` is
// false. Governance enforcement is intentionally ALWAYS-ON (Part III "always-on authorization"):
// it is gated on stored configuration, never on an edition/entitlement flag, so a platform that
// has configured a filter has it honored in every edition.
//
// Fail-safe (Part III): the availability of any block is decided from the caller's own platform
// and project only; a principal without a platform (unauthenticated / worker) has no governance
// applied and sees the ungoverned catalog, which the private-visibility layer above has already
// reduced to public blocks.
import { FilteredBlockBehavior, isNil, BlocksFilterType, PlatformId } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../../core/db/repo-factory'
import { BlockMetadataSchema } from '../../../pieces/metadata/piece-metadata-entity'
import { platformService } from '../../../platform/platform.service'
import { ProjectPlanEntity } from '../../projects/project-plan/project-plan.entity'

const projectPlanRepo = repoFactory(ProjectPlanEntity)

// The resolved governance for a caller: the organization's allow/deny rule and the optional
// workspace allow-list. Both are resolved ONCE per list/get call, not per block.
type ResolvedGovernance = {
    // Organization filter, or null when there is no platform context (no governance applies).
    platform: {
        behavior: FilteredBlockBehavior
        names: Set<string>
    } | null
    // Workspace allow-list, or null when there is no project context or the workspace filter is
    // NONE (no workspace restriction applies).
    projectAllowList: Set<string> | null
}

async function resolveGovernance(
    log: FastifyBaseLogger,
    platformId: PlatformId | undefined,
    projectId: string | undefined,
): Promise<ResolvedGovernance> {
    const platform = isNil(platformId) ? null : await platformService(log).getOne(platformId)
    const projectPlan = isNil(projectId)
        ? null
        : await projectPlanRepo().findOneBy({ projectId })

    return {
        platform: isNil(platform)
            ? null
            : {
                behavior: platform.filteredBlockBehavior,
                names: new Set(platform.filteredBlockNames),
            },
        projectAllowList: !isNil(projectPlan) && projectPlan.blocksFilterType === BlocksFilterType.ALLOWED
            ? new Set(projectPlan.blocks)
            : null,
    }
}

// Decide availability for a single block against already-resolved governance. Returns true when
// the block is HIDDEN (filtered out) — i.e. either governance layer disallows it.
function isBlockFiltered(blockName: string, governance: ResolvedGovernance): boolean {
    const { platform, projectAllowList } = governance

    if (!isNil(platform)) {
        const isNamed = platform.names.has(blockName)
        // ALLOWED: an allow-list — a block NOT named is hidden.
        // BLOCKED: a deny-list — a block named is hidden.
        const blockedByPlatform = platform.behavior === FilteredBlockBehavior.ALLOWED
            ? !isNamed
            : isNamed
        if (blockedByPlatform) {
            return true
        }
    }

    if (!isNil(projectAllowList) && !projectAllowList.has(blockName)) {
        return true
    }

    return false
}

export const enterpriseFilteringUtils = (log: FastifyBaseLogger) => ({
    // Single-block availability check on the get path. True → the block is not available to this
    // caller and the caller MUST treat it as absent (the metadata service returns undefined).
    async isFiltered(params: {
        block: BlockMetadataSchema
        projectId: string | undefined
        platformId: PlatformId | undefined
    }): Promise<boolean> {
        const governance = await resolveGovernance(log, params.platformId, params.projectId)
        return isBlockFiltered(params.block.name, governance)
    },
    // Catalog-availability check on the list path. Returns the subset of blocks available to the
    // caller. `includeHidden` is an explicit administrative bypass (e.g. management views that
    // must see governed-out blocks) — when set, governance is not applied.
    async filter(params: {
        blocks: BlockMetadataSchema[]
        includeHidden?: boolean
        platformId?: PlatformId
        projectId?: string
    }): Promise<BlockMetadataSchema[]> {
        if (params.includeHidden) {
            return params.blocks
        }
        const governance = await resolveGovernance(log, params.platformId, params.projectId)
        // No governance resolved at all → nothing to filter; return the list unchanged.
        if (isNil(governance.platform) && isNil(governance.projectAllowList)) {
            return params.blocks
        }
        return params.blocks.filter((block) => !isBlockFiltered(block.name, governance))
    },
})
