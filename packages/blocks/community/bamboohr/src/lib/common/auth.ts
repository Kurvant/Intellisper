import { BlockAuth, Property } from '@intelblocks/blocks-framework';

export const bambooHrAuth = BlockAuth.CustomAuth({
  required: true,
  description:
    'Follow [these instructions](https://documentation.bamboohr.com/docs/getting-started#authentication) to get your API key',
  props: {
    companyDomain: Property.ShortText({
      displayName: 'Company domain',
      description:
        'The subdomain used to access BambooHR. If you access BambooHR at https://mycompany.bamboohr.com, then the companyDomain is "mycompany"',
      required: true,
    }),
    apiKey: BlockAuth.SecretText({
      displayName: 'API key',
      required: true,
    }),
  },
});
