import {
  AgentBlockTool,
  AppConnectionType,
  AppConnectionValue,
  ExecutionType,
  FlowRunId,
  PopulatedFlow,
  ProjectId,
  RespondResponse,
  ResumePayload,
  SeekPage,
  TriggerPayload,
  TriggerStrategy,
} from '@intelblocks/shared';
import { LanguageModel, Tool } from 'ai'

import {
  BasicAuthProperty,
  CustomAuthProperty,
  InputPropertyMap,
  OAuth2Property,
  SecretTextProperty,
  StaticPropsValue,
} from '../property';
import { BlockAuthProperty } from '../property/authentication';
import { DelayPauseMetadata, PauseMetadata, WebhookPauseMetadata } from '@intelblocks/shared';

export type BaseContext<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined,
  Props extends InputPropertyMap
> = {
  flows: FlowsContext;
  step: StepContext;
    auth: AppConnectionValueForAuthProperty<BlockAuth>;
  propsValue: StaticPropsValue<Props>;
  store: Store;
  project: {
    id: ProjectId;
    externalId: () => Promise<string | undefined>;
  };
  connections: ConnectionsManager;
};


type ExtractCustomAuthProps<T> = T extends CustomAuthProperty<infer Props> ? Props : never;

type ExtractOAuth2Props<T> = T extends OAuth2Property<infer Props> ? Props : never;


export type AppConnectionValueForAuthProperty<T extends BlockAuthProperty | BlockAuthProperty[] | undefined> = 
  T extends BlockAuthProperty[] ? AppConnectionValueForSingleAuthProperty<T[number]> :
  T extends BlockAuthProperty ? AppConnectionValueForSingleAuthProperty<T> :
  T extends undefined ? undefined : never;

type AppConnectionValueForSingleAuthProperty<T extends BlockAuthProperty | undefined> = 
  T extends SecretTextProperty<boolean> ? AppConnectionValue<AppConnectionType.SECRET_TEXT> :
  T extends BasicAuthProperty ? AppConnectionValue<AppConnectionType.BASIC_AUTH> :
  T extends CustomAuthProperty<any> ? AppConnectionValue<AppConnectionType.CUSTOM_AUTH, StaticPropsValue<ExtractCustomAuthProps<T>>> :
  T extends OAuth2Property<any> ? AppConnectionValue<AppConnectionType.OAUTH2, StaticPropsValue<ExtractOAuth2Props<T>>> :
  T extends undefined ? undefined : never;
type AppWebhookTriggerHookContext<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap
> = BaseContext<BlockAuth, TriggerProps> & {
  webhookUrl: string;
  payload: TriggerPayload;
  app: {
    createListeners({
      events,
      identifierValue,
    }: {
      events: string[];
      identifierValue: string;
    }): void;
  };
};

type PollingTriggerHookContext<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap
> = BaseContext<BlockAuth, TriggerProps> & {
  setSchedule(schedule: { cronExpression: string; timezone?: string }): void;
};

type WebhookTriggerHookContext<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
> = BaseContext<BlockAuth, TriggerProps> & {
  webhookUrl: string;
  payload: TriggerPayload;
  server: ServerContext;
};
export type TriggerHookContext<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
  S extends TriggerStrategy,
> = S extends TriggerStrategy.APP_WEBHOOK
  ? AppWebhookTriggerHookContext<BlockAuth, TriggerProps>
  : S extends TriggerStrategy.POLLING
  ? PollingTriggerHookContext<BlockAuth, TriggerProps>
  : S extends TriggerStrategy.WEBHOOK
  ? WebhookTriggerHookContext<BlockAuth, TriggerProps> & {
    server: ServerContext;
  }
  : never;

export type TestOrRunHookContext<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
  S extends TriggerStrategy
> = TriggerHookContext<BlockAuth, TriggerProps, S> & {
  files: FilesService;
};

export type StopHookParams = {
  response: RespondResponse;
};

export type RespondHookParams = {
  response: RespondResponse;
};

export type StopHook = (params?: StopHookParams) => void;

export type RespondHook = (params?: RespondHookParams) => void;

/** @deprecated Since 2026-04-12. Use {@link CreateWaitpointHook} and {@link WaitForWaitpointHook} instead. */
export type PauseHookParams = {
  pauseMetadata: PauseMetadata;
};

/** @deprecated Since 2026-04-12. Use {@link CreateWaitpointHook} and {@link WaitForWaitpointHook} instead. */
export type PauseHook = (params: {
  pauseMetadata: Omit<DelayPauseMetadata, 'requestIdToReply'> | Omit<WebhookPauseMetadata, 'requestId' | 'requestIdToReply'>
}) => void;

export type FlowsContext = {
  list(params?: ListFlowsContextParams): Promise<SeekPage<PopulatedFlow>>
  current: {
    id: string;
    version: {
      id: string;
    };
  };
}

export type StepContext = {
  name: string;
}

export type ListFlowsContextParams = {
  externalIds?: string[]
}


export type PropertyContext = {
  server: ServerContext;
  project: {
    id: ProjectId;
    externalId: () => Promise<string | undefined>;
  };
  searchValue?: string;
  flows: FlowsContext;
  connections: ConnectionsManager;
};

export type ServerContext = {
  apiUrl: string;
  publicUrl: string;
  token: string;
};

export type CreateWaitpointParams = {
  type: 'DELAY' | 'WEBHOOK';
  version?: 'V0' | 'V1';
  resumeDateTime?: string;
  responseToSend?: RespondResponse;
};

export type CreateWaitpointResult = {
  id: string;
  resumeUrl: string;
  buildResumeUrl: (params: { queryParams: Record<string, string>, sync?: boolean }) => string;
};

export type CreateWaitpointHook = (params: CreateWaitpointParams) => Promise<CreateWaitpointResult>;
export type WaitForWaitpointHook = (waitpointId: string) => void;

export type RunContext = {
  id: FlowRunId;
  stop: StopHook;
  /** @deprecated Use createWaitpoint + waitForWaitpoint instead */
  pause?: PauseHook;
  respond: RespondHook;
  createWaitpoint: CreateWaitpointHook;
  waitForWaitpoint: WaitForWaitpointHook;
}

export type OnStartContext<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap
> = Omit<BaseContext<BlockAuth, TriggerProps>, 'flows'> & {
  run: Pick<RunContext, 'id'>;
  payload: unknown;
}


export type OutputContext = {
  update: (params: {
    data: {
      [key: string]: unknown;
    };
  }) => Promise<void>;
}

type BaseActionContext<
  ET extends ExecutionType,
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined,
  ActionProps extends InputPropertyMap
> = BaseContext<BlockAuth, ActionProps> & {
  executionType: ET;
  tags: TagsManager;
  server: ServerContext;
  files: FilesService;
  output: OutputContext;
  agent: AgentContext;
  run: RunContext;
  /** @deprecated Use waitpoint.buildResumeUrl() from createWaitpoint result instead */
  generateResumeUrl?: (params: {
    queryParams: Record<string, string>,
    sync?: boolean
  }) => string;
};

type BeginExecutionActionContext<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined = undefined,
  ActionProps extends InputPropertyMap = InputPropertyMap
> = BaseActionContext<ExecutionType.BEGIN, BlockAuth, ActionProps>;

type ResumeExecutionActionContext<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined = undefined,
  ActionProps extends InputPropertyMap = InputPropertyMap
> = BaseActionContext<ExecutionType.RESUME, BlockAuth, ActionProps> & {
  resumePayload: ResumePayload;
};

export type ActionContext<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined = undefined,
  ActionProps extends InputPropertyMap = InputPropertyMap
> =
  | BeginExecutionActionContext<BlockAuth, ActionProps>
  | ResumeExecutionActionContext<BlockAuth, ActionProps>;




export type ConstructToolParams = {
  tools: AgentBlockTool[]
  model: LanguageModel,
}

export interface AgentContext {
  tools: (params: ConstructToolParams) => Promise<Record<string, Tool>>;
}

export interface FilesService {
  write({
    fileName,
    data,
  }: {
    fileName: string;
    data: Buffer;
  }): Promise<string>;
}

export interface ConnectionsManager {
  get(
    key: string
  ): Promise<AppConnectionValue | Record<string, unknown> | string | null>;
}

export interface TagsManager {
  add(params: { name: string }): Promise<void>;
}

export interface Store {
  put<T>(key: string, value: T, scope?: StoreScope): Promise<T>;
  get<T>(key: string, scope?: StoreScope): Promise<T | null>;
  delete(key: string, scope?: StoreScope): Promise<void>;
}

export enum StoreScope {
  // Collection were deprecated in favor of project
  PROJECT = 'COLLECTION',
  FLOW = 'FLOW',
}