import { z } from 'zod'
import { IbId } from '../../core/common/id-generator'

export const WebhookUrlParams = z.object({
    flowId: IbId,
})

export type WebhookUrlParams = z.infer<typeof WebhookUrlParams>
