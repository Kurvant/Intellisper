import { BlockAuth, Property } from '@intelblocks/blocks-framework';

export const cyberarkAuth = BlockAuth.CustomAuth({
  description: 'CyberArk PVWA Authentication',
  props: {
    serverUrl: Property.ShortText({
      displayName: 'PVWA Server URL',
      description: 'The PVWA server URL (e.g., https://pvwa-server)',
      required: true
    }),
    username: Property.ShortText({
      displayName: 'Username',
      description: 'CyberArk username',
      required: true
    }),
    password: Property.ShortText({
      displayName: 'Password',
      description: 'CyberArk password',
      required: true
    })
  },
  required: true
});
