import {
  BlockMetadataModel,
  BlockMetadataModelSummary,
  BlockPackageInformation,
  PropertyType,
  ExecutePropsResult,
  InputPropertyMap,
} from '@intelblocks/blocks-framework';
import {
  AddBlockRequestBody,
  IbEdition,
  GetBlockRequestParams,
  GetBlockRequestQuery,
  ListBlocksRequestQuery,
  PackageType,
  BlockOptionRequest,
} from '@intelblocks/shared';
import { t } from 'i18next';

import { internalErrorToast } from '@/components/ui/sonner';
import { api } from '@/lib/api';

export const blocksApi = {
  list(request: ListBlocksRequestQuery): Promise<BlockMetadataModelSummary[]> {
    return api.get<BlockMetadataModelSummary[]>('/v1/blocks', request);
  },
  get(
    request: GetBlockRequestParams & GetBlockRequestQuery,
  ): Promise<BlockMetadataModel> {
    return api.get<BlockMetadataModel>(`/v1/blocks/${request.name}`, {
      version: request.version ?? undefined,
      locale: request.locale ?? undefined,
      projectId: request.projectId ?? undefined,
    });
  },
  options<
    T extends
      | PropertyType.DROPDOWN
      | PropertyType.MULTI_SELECT_DROPDOWN
      | PropertyType.DYNAMIC,
  >(
    request: BlockOptionRequest,
    propertyType: T,
  ): Promise<ExecutePropsResult<T>> {
    return api
      .post<ExecutePropsResult<T>>(`/v1/blocks/options`, request)
      .catch((error) => {
        console.error(error);
        internalErrorToast();
        const defaultStateForDynamicProperty: ExecutePropsResult<PropertyType.DYNAMIC> =
          {
            options: {} as InputPropertyMap,
            type: PropertyType.DYNAMIC,
          };
        const defaultStateForDropdownProperty: ExecutePropsResult<PropertyType.DROPDOWN> =
          {
            options: {
              options: [],
              disabled: true,
              placeholder: t(
                'An internal error occurred, please contact support',
              ),
            },
            type: PropertyType.DROPDOWN,
          };
        return (
          propertyType === PropertyType.DYNAMIC
            ? defaultStateForDynamicProperty
            : defaultStateForDropdownProperty
        ) as ExecutePropsResult<T>;
      });
  },
  syncFromCloud() {
    return api.post<void>(`/v1/blocks/sync`, {});
  },
  async install(params: AddBlockRequestBody) {
    const formData = new FormData();
    formData.set('packageType', params.packageType);
    formData.set('blockName', params.blockName);
    formData.set('blockVersion', params.blockVersion);
    formData.set('scope', params.scope);
    if (params.packageType === PackageType.ARCHIVE) {
      const buffer = await (
        params.blockArchive as unknown as File
      ).arrayBuffer();
      formData.append('blockArchive', new Blob([buffer]));
    }

    return api.post<BlockMetadataModel>('/v1/blocks', formData, undefined, {
      'Content-Type': 'multipart/form-data',
    });
  },
  registry(
    release: string,
    edition: IbEdition,
  ): Promise<BlockPackageInformation[]> {
    return api.get<BlockPackageInformation[]>('/v1/blocks/registry', {
      release,
      edition,
    });
  },
  delete(id: string) {
    return api.delete(`/v1/blocks/${id}`);
  },
};
