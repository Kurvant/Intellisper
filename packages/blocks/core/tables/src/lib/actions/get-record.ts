import { createAction, BlockAuth, Property } from '@intelblocks/blocks-framework';
import { tablesCommon } from '../common';
import { AuthenticationType, httpClient, HttpMethod } from '@intelblocks/blocks-common';
import { PopulatedRecord } from '@intelblocks/shared';

export const getRecord = createAction({
  audience: 'human',
  name: 'tables-get-record',
  displayName: 'Get Record',
  description: 'Get single record by its id.',
  auth: BlockAuth.None(),
  props: {
    table_id: tablesCommon.table_id,
    record_id: tablesCommon.record_id,
  },
  async run(context) {
    const { record_id } = context.propsValue;

    const response = await httpClient.sendRequest({
      method: HttpMethod.GET,
      url: `${context.server.apiUrl}v1/records/${record_id}`,
      authentication: {
        type: AuthenticationType.BEARER_TOKEN,
        token: context.server.token,
      },
      retries: 5,
    });

    return tablesCommon.formatRecord(response.body as PopulatedRecord);
  },
});
