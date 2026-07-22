import { z } from 'zod'

/**
 * Sign in with a client-supplied Google id_token (implicit / id-token flow — used by the browser
 * extension via chrome.identity). The token is verified server-side against Google's JWKS with the
 * extension's own OAuth client id as the audience; no code exchange is performed.
 */
export const GoogleIdTokenRequest = z.object({
    // A JWT from Google. Bounded so a runaway body can't be pushed through the verifier.
    idToken: z.string().min(1).max(8192),
})

export type GoogleIdTokenRequest = z.infer<typeof GoogleIdTokenRequest>
