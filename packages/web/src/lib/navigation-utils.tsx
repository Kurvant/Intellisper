import { useNavigate, useSearchParams } from 'react-router-dom';

import { useEmbedding } from '@/components/providers/embed-provider';

export const useNewWindow = () => {
  const { embedState } = useEmbedding();
  const navigate = useNavigate();
  if (embedState.isEmbedded) {
    return (route: string, searchParams?: string) =>
      navigate({
        pathname: route,
        search: searchParams,
      });
  } else {
    return (route: string, searchParams?: string) =>
      window.open(
        `${route}${searchParams ? '?' + searchParams : ''}`,
        '_blank',
        'noopener noreferrer',
      );
  }
};

export const FROM_QUERY_PARAM = 'from';
/**State param is for oauth2 flow, it is used to redirect to the page after login*/
export const STATE_QUERY_PARAM = 'state';
export const LOGIN_QUERY_PARAM = 'intellisperLogin';
export const PROVIDER_NAME_QUERY_PARAM = 'providerName';

export const useDefaultRedirectPath = () => {
  // Post-login / fallback landing target. '/home' is the overhaul (new shell) command-center:
  // login-gated but NOT project-scoped, so it is always safe to navigate to right after
  // authentication — before project/permission state has loaded. The legacy '/flows' target
  // landed users in the old shell.
  return '/home';
};

export const useRedirectAfterLogin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultRedirectPath = useDefaultRedirectPath();
  const from = searchParams.get(FROM_QUERY_PARAM) ?? defaultRedirectPath;
  return () => navigate(from);
};
