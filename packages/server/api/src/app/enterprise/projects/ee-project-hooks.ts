// Clean-room implementation — enterprise project post-create hook (capability spec I.7 / A.2
// establishment variation point). Installed via projectHooks.set in the CLOUD/ENTERPRISE
// edition branches; community keeps the default no-op hook.
//
// On workspace establishment, when an alert-receiver email is supplied, register it as an
// EMAIL alert recipient for the new workspace. This is a best-effort companion side effect:
// it runs after the workspace already exists, adding a recipient is idempotent (a repeat is a
// no-op, not an error), and the email is normalized to lower-case so it matches regardless of
// the casing the caller supplied.
import { AlertChannel, isNil, Project } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { ProjectHooks } from '../../project/project-hooks'
import { alertsService } from '../alerts/alerts-service'

export const projectEnterpriseHooks = (log: FastifyBaseLogger): ProjectHooks => ({
    async postCreate(project: Project, context) {
        const alertReceiverEmail = context?.alertReceiverEmail
        if (isNil(alertReceiverEmail) || alertReceiverEmail.trim() === '') {
            return
        }
        await alertsService(log).add({
            channel: AlertChannel.EMAIL,
            projectId: project.id,
            receiver: alertReceiverEmail.toLowerCase(),
        })
    },
})
