import { Trigger } from './trigger/trigger';
import { Action } from './action/action';
import {
  EventPayload,
  ParseEventResponse,
  BlockCategory,
} from '@intelblocks/shared';
import { BlockBase, BlockMetadata} from './piece-metadata';
import { BlockAuthProperty } from './property/authentication';
import { ServerContext } from './context';
import { ContextVersion, LATEST_CONTEXT_VERSION, MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION } from './context/versioning';



export class Block<BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined = BlockAuthProperty>
  implements Omit<BlockBase, 'version' | 'name'>
{
  private readonly _actions: Record<string, Action> = {};
  private readonly _triggers: Record<string, Trigger> = {};
  // this method didn't exist in older version
  public getContextInfo: (() => { version: ContextVersion } )| undefined = () => ({ version: LATEST_CONTEXT_VERSION });
  constructor(
    public readonly displayName: string,
    public readonly logoUrl: string,
    public readonly authors: string[],
    public readonly events: BlockEventProcessors | undefined,
    actions: Action[],
    triggers: Trigger[],
    public readonly categories: BlockCategory[],
    public readonly auth?: BlockAuth,
    public readonly minimumSupportedRelease: string = MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION,
    public readonly maximumSupportedRelease?: string,
    public readonly description = '',
  ) {
    if (!isValidSimpleSemver(minimumSupportedRelease) || isSemverLessThan(minimumSupportedRelease, MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION)) {
      this.minimumSupportedRelease = MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION;
    }
    actions.forEach((action) => (this._actions[action.name] = action));
    triggers.forEach((trigger) => (this._triggers[trigger.name] = trigger));
  }


  metadata(): BackwardCompatiblePieceMetadata {
    return {
      displayName: this.displayName,
      logoUrl: this.logoUrl,
      actions: this._actions,
      triggers: this._triggers,
      categories: this.categories,
      description: this.description,
      authors: this.authors,
      auth: this.auth,
      minimumSupportedRelease: this.minimumSupportedRelease,
      maximumSupportedRelease: this.maximumSupportedRelease,
      contextInfo: this.getContextInfo?.()
    };
  }

  getAction(actionName: string): Action | undefined {
    return this._actions[actionName];
  }

  getTrigger(triggerName: string): Trigger | undefined {
    return this._triggers[triggerName];
  }

  actions() {
    return this._actions;
  }

  triggers() {
    return this._triggers;
  }
}

export const createBlock = <BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined>(
  params: CreatePieceParams<BlockAuth>
) => {
  if(params.auth && Array.isArray(params.auth)) { 
    const isUnique = params.auth.every((auth, index, self) =>
      index === self.findIndex((t) => t.type === auth.type)
    );
    if(!isUnique) {
     throw new Error('Auth properties must be unique by type');
    }
  }
  return new Block<BlockAuth>(
    params.displayName,
    params.logoUrl,
    params.authors ?? [],
    params.events,
    params.actions,
    params.triggers,
    params.categories ?? [],
    params.auth,
    params.minimumSupportedRelease,
    params.maximumSupportedRelease,
    params.description,
  );
};

type CreatePieceParams<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined = undefined
> = {
  displayName: string;
  logoUrl: string;
  authors: string[];
  description?: string;
  auth: BlockAuth | undefined;
  events?: BlockEventProcessors;
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
  actions: Action[];
  triggers: Trigger[];
  categories?: BlockCategory[];
};

type BlockEventProcessors = {
  parseAndReply: (ctx: { payload: EventPayload, server: Omit<ServerContext, 'token' | 'apiUrl'> }) => ParseEventResponse;
  verify: (ctx: {
    webhookSecret: string | Record<string, string>;
    payload: EventPayload;
    appWebhookUrl: string;
  }) => boolean;
};

type BackwardCompatiblePieceMetadata = Omit<BlockMetadata, 'name' | 'version' | 'authors' | 'i18n' | 'getContextInfo'> & {
  authors?: BlockMetadata['authors']
  i18n?: BlockMetadata['i18n']
}

function isValidSimpleSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function isSemverLessThan(a: string, b: string): boolean {
  const [a1, a2, a3] = a.split('.').map(Number);
  const [b1, b2, b3] = b.split('.').map(Number);
  if (a1 !== b1) return a1 < b1;
  if (a2 !== b2) return a2 < b2;
  return a3 < b3;
}

