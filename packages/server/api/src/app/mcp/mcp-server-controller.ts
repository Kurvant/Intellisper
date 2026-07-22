import { IbId, Permission, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, UpdateMcpServerRequest } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { mcpServerService } from './mcp-service'

export const mcpServerController: FastifyPluginAsyncZod = async (app) => {

    app.get('/', GetMcpRequest, async (req) => {
        return mcpServerService(req.log).getPopulatedByProjectId(req.projectId)
    })

    app.post('/', UpdateMcpRequest, async (req) => {
        const { disabledTools } = req.body
        return mcpServerService(req.log).update({
            projectId: req.projectId,
            disabledTools,
        })
    })

    app.post('/rotate', RotateTokenRequest, async (req) => {
        return mcpServerService(req.log).rotateToken({
            projectId: req.projectId,
        })
    })
}

export const UpdateMcpRequest = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER],
            Permission.WRITE_MCP,
            {
                type: ProjectResourceType.PARAM,
            },
        ),
    },
    schema: {
        tags: ['mcp'],
        summary: 'Update the project MCP server',
        description: 'Update the project MCP server configuration',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: z.object({
            projectId: IbId,
        }),
        body: UpdateMcpServerRequest,
    },
}

const GetMcpRequest = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER],
            Permission.READ_MCP,
            {
                type: ProjectResourceType.PARAM,
            },
        ),
    },
    schema: {
        tags: ['mcp'],
        summary: 'Get an MCP server',
        description: 'Get an MCP server by ID',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: z.object({
            projectId: IbId,
        }),
    },
}

const RotateTokenRequest = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER],
            Permission.WRITE_MCP,
            {
                type: ProjectResourceType.PARAM,
            },
        ),
    },
    schema: {
        tags: ['mcp'],
        summary: 'Rotate the MCP server token',
        description: 'Rotate the MCP server token',
    },
    params: z.object({
        projectId: IbId,
    }),
}
