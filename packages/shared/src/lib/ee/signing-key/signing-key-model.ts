import { z } from 'zod'
import { BaseModelSchema } from '../../core/common/base-model'
import { IbId } from '../../core/common/id-generator'

export enum KeyAlgorithm {
    RSA = 'RSA',
}

export type SigningKeyId = IbId

export const SigningKey = z.object({
    ...BaseModelSchema,
    platformId: IbId,
    publicKey: z.string(),
    displayName: z.string(),
    /* algorithm used to generate this key pair */
    algorithm: z.nativeEnum(KeyAlgorithm),
})

export type SigningKey = z.infer<typeof SigningKey>
