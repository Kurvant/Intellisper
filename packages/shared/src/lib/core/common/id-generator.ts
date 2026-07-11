import { customAlphabet } from 'nanoid'
import { z } from 'zod'

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const ID_LENGTH = 21

export const IbId = z.string().regex(new RegExp(`^[0-9a-zA-Z]{${ID_LENGTH}}$`))

export type IbId = z.infer<typeof IbId>

export const ibId = customAlphabet(ALPHABET, ID_LENGTH)

export const secureIbId = (length: number) => customAlphabet(ALPHABET, length)()
