import { z } from 'zod';
import { ActionContext } from '../context';
import type { OutputSchema } from '../output-schema';
import { ActionBase, Audience, AiMetadata } from '../piece-metadata';
import { InputPropertyMap } from '../property';
import { ExtractPieceAuthPropertyTypeForMethods, BlockAuthProperty } from '../property/authentication';

export type ActionRunner<BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined = BlockAuthProperty, ActionProps extends InputPropertyMap = InputPropertyMap> =
  (ctx: ActionContext<BlockAuth, ActionProps>) => Promise<unknown | void>

export const ErrorHandlingOptionsParam = z.object({
  retryOnFailure: z.object({
    defaultValue: z.boolean().optional(),
    hide: z.boolean().optional(),
  }),
  continueOnFailure: z.object({
    defaultValue: z.boolean().optional(),
    hide: z.boolean().optional(),
  }),
})
export type ErrorHandlingOptionsParam = z.infer<typeof ErrorHandlingOptionsParam>

type CreateActionParams<BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined, ActionProps extends InputPropertyMap> = {
  /**
   * A dummy parameter used to infer {@code BlockAuth} type
   */
  name: string
  /**
   * this parameter is used to infer the type of the piece auth value in run and test methods
   */
  auth?: BlockAuth
  displayName: string
  description: string
  props: ActionProps
  run: ActionRunner<ExtractPieceAuthPropertyTypeForMethods<BlockAuth>, ActionProps>
  test?: ActionRunner<ExtractPieceAuthPropertyTypeForMethods<BlockAuth>, ActionProps>
  requireAuth?: boolean
  errorHandlingOptions?: ErrorHandlingOptionsParam
  outputSchema?: OutputSchema
  audience?: Audience
  aiMetadata?: AiMetadata
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class IAction<BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined = any, ActionProps extends InputPropertyMap = InputPropertyMap> implements ActionBase {
  constructor(
    public readonly name: string,
    public readonly displayName: string,
    public readonly description: string,
    public readonly props: ActionProps,
    public readonly run: ActionRunner<ExtractPieceAuthPropertyTypeForMethods<BlockAuth>, ActionProps>,
    public readonly test: ActionRunner<ExtractPieceAuthPropertyTypeForMethods<BlockAuth>, ActionProps>,
    public readonly requireAuth: boolean,
    public readonly errorHandlingOptions: ErrorHandlingOptionsParam,
    public readonly outputSchema?: OutputSchema,
    public readonly audience?: Audience,
    public readonly aiMetadata?: AiMetadata,
  ) { }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Action<
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined = any,
  ActionProps extends InputPropertyMap = any,
> = IAction<BlockAuth, ActionProps>

export const createAction = <
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined = BlockAuthProperty,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ActionProps extends InputPropertyMap = any
>(
  params: CreateActionParams<BlockAuth, ActionProps>,
) => {
  return new IAction(
    params.name,
    params.displayName,
    params.description,
    params.props,
    params.run,
    params.test ?? params.run,
    params.requireAuth ?? true,
    params.errorHandlingOptions ?? {
      continueOnFailure: {
        defaultValue: false,
      },
      retryOnFailure: {
        defaultValue: false,
      }
    },
    params.outputSchema,
    params.audience,
    params.aiMetadata,
  )
}
