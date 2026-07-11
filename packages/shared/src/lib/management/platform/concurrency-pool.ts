import { z } from 'zod'
import { BaseModelSchema } from '../../core/common/base-model'
import { IbId } from '../../core/common/id-generator'

export const ConcurrencyPool = z.object({
    ...BaseModelSchema,
    platformId: IbId,
    key: z.string(),
    maxConcurrentJobs: z.number().int().positive(),
})
export type ConcurrencyPool = z.infer<typeof ConcurrencyPool>
