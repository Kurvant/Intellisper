import { BlockAuth, Property } from '@intelblocks/blocks-framework';

export const rabbitmqAuth = BlockAuth.CustomAuth({
  description: "Rabbitmq Auth",
  required: true,
  props: {
    host: Property.ShortText({
      displayName: "Host",
      description: "Host",
      required: true,
    }),
    username: Property.ShortText({
      displayName: "Username",
      description: "Username",
      required: true,
    }),
    password: BlockAuth.SecretText({
      displayName: "Password",
      description: "Password",
      required: true,
    }),
    port: Property.Number({
      displayName: "Port",
      description: "Port",
      required: true,
    }),
    vhost: Property.ShortText({
      displayName: "Virtual Host",
      description: "Virtual Host",
      required: false,
    }),
  },
});
