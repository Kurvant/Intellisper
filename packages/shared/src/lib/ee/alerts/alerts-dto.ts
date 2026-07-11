import { z } from 'zod'
import { BaseModelSchema } from '../../core/common/base-model'
import { IbId } from '../../core/common/id-generator'

export enum AlertChannel {
    EMAIL = 'EMAIL',
}


export const Alert = z.object({
    ...BaseModelSchema,
    projectId: IbId,
    channel: z.nativeEnum(AlertChannel),
    receiver: z.string(),
})

export type Alert = z.infer<typeof Alert>
