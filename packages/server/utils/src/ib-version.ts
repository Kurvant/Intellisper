import fs from 'fs'
import path from 'path'

let cachedCurrentRelease: string | undefined
let cachedLatestRelease: string | undefined

function readCurrentRelease(): string {
    if (cachedCurrentRelease !== undefined) {
        return cachedCurrentRelease
    }
    try {
        const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')) as PackageJson
        cachedCurrentRelease = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'
    }
    catch {
        cachedCurrentRelease = '0.0.0'
    }
    return cachedCurrentRelease
}

export const ibVersionUtil = {
    getCurrentRelease(): string {
        return readCurrentRelease()
    },
    async getLatestRelease(): Promise<string> {
        // Version "call-home" removed: upstream fetched the latest release from
        // raw.githubusercontent.com/activepieces/activepieces, which signalled
        // this instance's existence to a third party on every flag read. This
        // edition reports the locally-installed version as the latest so no
        // outbound request is ever made.
        if (cachedLatestRelease) {
            return cachedLatestRelease
        }
        cachedLatestRelease = readCurrentRelease()
        return cachedLatestRelease
    },
}

type PackageJson = {
    version: string
}
