import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock } from '@intelblocks/blocks-framework';
import { browseAiAuth } from './lib/common/auth';
import { getTaskDetailsAction } from './lib/actions/get-task-details';
import { listRobotsAction } from './lib/actions/list-robots';
import { runRobotAction } from './lib/actions/run-robot';
import { taskFinishedWithErrorTrigger } from './lib/triggers/task-finished-with-error';
import { taskFinishedSuccessfullyTrigger } from './lib/triggers/task-finished-successfully';
import { BlockCategory } from '@intelblocks/shared';

export const browseAi = createBlock({
  displayName: 'Browse AI',
  auth: browseAiAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/browse-ai.png',
  categories:[BlockCategory.PRODUCTIVITY],
  authors: ['aryel780'],
  actions: [
    getTaskDetailsAction,
    listRobotsAction,
    runRobotAction,
    createCustomApiCallAction({
      auth: browseAiAuth,
      baseUrl: () => 'https://api.browse.ai/v2',
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.secret_text}`,
      }),
    }),
  ],
  triggers: [
    taskFinishedWithErrorTrigger,
    taskFinishedSuccessfullyTrigger,
  ],
});
