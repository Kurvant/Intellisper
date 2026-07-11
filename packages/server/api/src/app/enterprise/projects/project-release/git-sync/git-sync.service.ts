// Clean-room implementation — git synchronization for project releases (capability spec
// J.1). A GitRepo binds a workspace to an external SSH git remote and a branch, so the
// workspace's automation state can be serialized to and read from version control.
//
// Security:
//  - The SSH private key is a secret: it is encrypted at rest (never stored in clear) and
//    never returned to clients (responses use GitRepoWithoutSensitiveData).
//  - remoteUrl / branch / slug are validated by the shared ConfigureRepoRequest against
//    strict allow-list patterns (SSH-only remote, no option-like branches, no path
//    traversal in the slug) so nothing user-supplied can escape into a git command.
//  - Each workspace has at most one repo (unique per projectId).
//
// `onDeleted` is invoked on flow/table deletion in ALL editions; when no repo is configured
// it is a safe no-op and MUST NOT throw, or it would break the core delete path.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    IntellisperError,
    ibId,
    ConfigureRepoRequest,
    ErrorCode,
    FlowState,
    GitBranchType,
    GitPushOperationType,
    GitRepo,
    GitRepoWithoutSensitiveData,
    isNil,
    PlatformId,
    ProjectId,
    PushGitRepoRequest,
    SeekPage,
    UserId,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { simpleGit, SimpleGit } from 'simple-git'
import { repoFactory } from '../../../../core/db/repo-factory'
import { EncryptedObject, encryptUtils } from '../../../../helper/encryption'
import { paginationHelper } from '../../../../helper/pagination/pagination-utils'
import { projectStateService } from '../project-state/project-state.service'
import { GitRepoEntity } from './git-sync.entity'

const gitRepoRepo = repoFactory(GitRepoEntity)

function withoutSensitiveData(gitRepo: GitRepo): GitRepoWithoutSensitiveData {
    const { sshPrivateKey: _sshPrivateKey, ...rest } = gitRepo
    return rest
}

export const gitRepoService = (log: FastifyBaseLogger) => ({

    // Configure (create or replace) the workspace's git repo. Idempotent per project: a
    // second configure replaces the existing binding rather than creating a duplicate.
    async upsert(request: ConfigureRepoRequest): Promise<GitRepoWithoutSensitiveData> {
        const existing = await gitRepoRepo().findOneBy({ projectId: request.projectId })
        const encryptedSshPrivateKey = await encryptUtils.encryptString(request.sshPrivateKey)
        const gitRepo = await gitRepoRepo().save({
            id: existing?.id ?? ibId(),
            projectId: request.projectId,
            remoteUrl: request.remoteUrl,
            branch: request.branch,
            branchType: request.branchType,
            slug: request.slug,
            sshPrivateKey: JSON.stringify(encryptedSshPrivateKey),
        })
        return withoutSensitiveData(gitRepo)
    },

    // List the workspace's repos (zero or one) without sensitive key material.
    async list({ projectId }: { projectId: ProjectId }): Promise<SeekPage<GitRepoWithoutSensitiveData>> {
        const repos = await gitRepoRepo().findBy({ projectId })
        return paginationHelper.createPage(repos.map(withoutSensitiveData), null)
    },

    // Resolve a repo by id (not tenant-scoped here — the caller authorizes access to the
    // repo's project, so a repo in another tenant surfaces as a 403, not a 404).
    async getOneOrThrow({ id }: { id: string }): Promise<GitRepo> {
        const gitRepo = await gitRepoRepo().findOneBy({ id })
        if (isNil(gitRepo)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'git_repo', entityId: id },
            })
        }
        return gitRepo
    },

    async delete({ id, projectId }: { id: string, projectId: ProjectId }): Promise<void> {
        const gitRepo = await gitRepoRepo().findOneBy({ id, projectId })
        if (isNil(gitRepo)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'git_repo', entityId: id },
            })
        }
        await gitRepoRepo().delete({ id, projectId })
    },

    // Push the workspace's current automation state to the configured remote/branch.
    // Serializes the requested flows to files under the repo slug and commits + pushes.
    async push({ id, projectId, platformId, userId, request }: PushParams): Promise<void> {
        const gitRepo = await gitRepoRepo().findOneBy({ id, projectId })
        if (isNil(gitRepo)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'git_repo', entityId: id },
            })
        }

        const workDir = await mkdtemp(join(tmpdir(), 'ap-git-'))
        try {
            const git = await cloneRepo({ gitRepo, workDir, log })
            const flowsDir = join(workDir, gitRepo.slug, 'flows')
            await mkdir(flowsDir, { recursive: true })

            const state = await projectStateService(log).getProjectState({ projectId, platformId })
            const selected = selectFlowsForOperation(state.flows, request)
            await Promise.all(selected.map(async (flow) => {
                const fileName = `${flow.externalId ?? flow.id}.json`
                await writeFile(join(flowsDir, fileName), JSON.stringify(flow, null, 2), 'utf-8')
            }))

            await git.add('.')
            const status = await git.status()
            if (status.files.length === 0) {
                return
            }
            await git.commit(request.commitMessage)
            await git.push('origin', gitRepo.branch)
            log.info({ gitRepoId: gitRepo.id, projectId, userId }, 'Pushed project state to git')
        }
        finally {
            await rm(workDir, { recursive: true, force: true })
        }
    },

    // Invoked on flow/table deletion in every edition. If the workspace has a git repo on a
    // development (two-way) branch, the deletion is propagated to the repo; otherwise (no
    // repo, or a production branch) it is a safe no-op. Never throws.
    async onDeleted({ type, externalId, projectId, platformId, userId }: OnDeletedParams): Promise<void> {
        try {
            const gitRepo = await gitRepoRepo().findOneBy({ projectId })
            if (isNil(gitRepo) || gitRepo.branchType !== GitBranchType.DEVELOPMENT) {
                return
            }
            if (type !== GitPushOperationType.DELETE_FLOW && type !== GitPushOperationType.DELETE_TABLE) {
                return
            }
            const request: PushGitRepoRequest = type === GitPushOperationType.DELETE_FLOW
                ? { type: GitPushOperationType.DELETE_FLOW, commitMessage: `chore: delete flow ${externalId}`, externalFlowIds: [externalId] }
                : { type: GitPushOperationType.DELETE_TABLE, commitMessage: `chore: delete table ${externalId}`, externalTableIds: [externalId] }
            await this.push({ id: gitRepo.id, projectId, platformId, userId, request })
        }
        catch (error) {
            // Best-effort sync — a failure here must never break the core delete path.
            log.warn({ error, projectId, externalId }, 'git onDeleted sync failed (ignored)')
        }
    },
})

// Which flows a push targets: an explicit flow list for PUSH_FLOW/DELETE_FLOW, or the whole
// project for PUSH_EVERYTHING. Table-only operations push no flows.
function selectFlowsForOperation(flows: FlowState[], request: PushGitRepoRequest): FlowState[] {
    switch (request.type) {
        case GitPushOperationType.PUSH_EVERYTHING:
            return flows
        case GitPushOperationType.PUSH_FLOW:
        case GitPushOperationType.DELETE_FLOW: {
            const wanted = new Set(request.externalFlowIds)
            return flows.filter((flow) => wanted.has(flow.externalId ?? flow.id))
        }
        default:
            return []
    }
}

async function cloneRepo({ gitRepo, workDir, log }: CloneParams): Promise<SimpleGit> {
    const keyPath = join(workDir, 'id_rsa')
    const sshPrivateKey = await decryptSshPrivateKey(gitRepo)
    await writeFile(keyPath, sshPrivateKey.endsWith('\n') ? sshPrivateKey : `${sshPrivateKey}\n`, { mode: 0o600 })
    // StrictHostKeyChecking=accept-new avoids interactive host-key prompts on first connect.
    const sshCommand = `ssh -i ${keyPath} -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes`
    const git = simpleGit({ baseDir: workDir }).env({ ...process.env, GIT_SSH_COMMAND: sshCommand })
    await git.clone(gitRepo.remoteUrl, workDir, ['--branch', gitRepo.branch, '--single-branch'])
    await git.cwd(workDir)
    log.info({ gitRepoId: gitRepo.id }, 'Cloned git repo for sync')
    return git
}

// Decrypt a repo's stored SSH private key back to its clear PEM for use as a git identity.
export async function decryptSshPrivateKey(gitRepo: GitRepo): Promise<string> {
    const encrypted = JSON.parse(gitRepo.sshPrivateKey ?? '') as EncryptedObject
    return encryptUtils.decryptString(encrypted)
}

type PushParams = {
    id: string
    projectId: ProjectId
    platformId: PlatformId
    userId: UserId | null
    request: PushGitRepoRequest
}

type OnDeletedParams = {
    type: GitPushOperationType
    externalId: string
    userId: UserId | null
    projectId: ProjectId
    platformId: string
    log: FastifyBaseLogger
}

type CloneParams = {
    gitRepo: GitRepo
    workDir: string
    log: FastifyBaseLogger
}
