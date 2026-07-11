import { BasePropertySchema, TPropertyValue } from "../common";
import { DropdownState } from "./common";
import { AppConnectionValueForAuthProperty, PropertyContext } from "../../../context";
import { z } from "zod";
import { PropertyType } from "../property-type";
import { BlockAuthProperty } from "../../authentication";

type DynamicDropdownOptions<T, BlockAuth extends BlockAuthProperty | BlockAuthProperty[] |  undefined = undefined> = (
  propsValue: Record<string, unknown> & {
    auth?: BlockAuth extends undefined ? undefined : AppConnectionValueForAuthProperty<Exclude<BlockAuth, undefined>>;
  },
  ctx: PropertyContext,
) => Promise<DropdownState<T>>;

export const DropdownProperty = z.object({
  ...BasePropertySchema.shape,
  ...TPropertyValue(z.unknown(), PropertyType.DROPDOWN).shape,
  refreshers: z.array(z.string()),
});

export type DropdownProperty<T, R extends boolean, BlockAuth extends BlockAuthProperty | BlockAuthProperty[] |  undefined = undefined> = BasePropertySchema & {
  /**
   * A dummy property used to infer {@code BlockAuth} type
   */
  auth: BlockAuth;
  refreshers: string[];
  refreshOnSearch?: boolean;
  options: DynamicDropdownOptions<T, BlockAuth>;
} & TPropertyValue<T, PropertyType.DROPDOWN, R>;


export const MultiSelectDropdownProperty = z.object({
  ...BasePropertySchema.shape,
  ...TPropertyValue(z.array(z.unknown()), PropertyType.MULTI_SELECT_DROPDOWN).shape,
  refreshers: z.array(z.string()),
});

export type MultiSelectDropdownProperty<
  T,
  R extends boolean,
  BlockAuth extends BlockAuthProperty | BlockAuthProperty[] | undefined = undefined
> = BasePropertySchema & {
  /**
   * A dummy property used to infer {@code BlockAuth} type
   */
  auth: BlockAuth;
  refreshers: string[];
  refreshOnSearch?: boolean;
  options: DynamicDropdownOptions<T, BlockAuth>;
} & TPropertyValue<
  T[],
  PropertyType.MULTI_SELECT_DROPDOWN,
  R
>;
