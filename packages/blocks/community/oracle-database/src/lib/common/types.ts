import { StaticPropsValue } from '@intelblocks/blocks-framework';
import { oracleDbAuth } from '../common/auth';

export type OracleDbAuth = StaticPropsValue<(typeof oracleDbAuth)['props']>;
