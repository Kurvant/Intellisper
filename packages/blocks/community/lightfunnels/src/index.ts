import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { OAuth2GrantType, BlockCategory } from '@intelblocks/shared';
import { newOrderTrigger } from './lib/triggers/new-order';
import { newLeadTrigger } from './lib/triggers/new-lead';
import { listProducts } from './lib/actions/list-products';
import { getProduct } from './lib/actions/get-product';
import { createProduct } from './lib/actions/create-product';
import { getOrder } from './lib/actions/get-order';
import { listOrders } from './lib/actions/list-orders';
import { cancelOrder } from './lib/actions/cancel-order';
import { createCustomer } from './lib/actions/create-customer';
import { getCustomer } from './lib/actions/get-customer';
import { listCustomers } from './lib/actions/list-customers';
import { getFunnel } from './lib/actions/get-funnel';
import { lightfunnelsAuth } from './lib/auth';

export const lightfunnels = createBlock({
  displayName: 'Lightfunnels',
  auth: lightfunnelsAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/lightfunnels.png',
  categories: [BlockCategory.SALES_AND_CRM, BlockCategory.COMMERCE],
  authors: ['aminefrira','sanket-a11y'],
  actions: [
    listProducts,
    getProduct,
    createProduct,
    getOrder,
    listOrders,
    cancelOrder,
    createCustomer,
    getCustomer,
    listCustomers,
    getFunnel,
  ],
  triggers: [newOrderTrigger, newLeadTrigger],
});
