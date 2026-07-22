import {
  IbEdition,
  IbFlagId,
  ThirdPartyAuthnProvidersToShowMap,
} from '@intelblocks/shared';
import { t } from 'i18next';
import { Bot, Check, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useTheme } from '@/components/providers/theme-provider';
import { authenticationSession } from '@/lib/authentication-session';
import { useRedirectAfterLogin } from '@/lib/navigation-utils';

import { FullLogo } from '../../../components/custom/full-logo';
import { HorizontalSeparatorWithText } from '../../../components/ui/separator';
import { flagsHooks } from '../../../hooks/flags-hooks';

import { SamlLoginForm } from './saml-login-form';
import { SignInForm } from './sign-in-form';
import { SignUpForm } from './sign-up-form';
import { SignupAutomationScene } from './signup-automation-scene';
import { ThirdPartyLogin } from './third-party-logins';

const BottomNote = ({ isSignup }: { isSignup: boolean }) => {
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.toString();

  return isSignup ? (
    <div className="mt-6 text-center text-[14px] text-muted-foreground">
      {t('Already have an account?')}
      <Link
        to={`/sign-in?${searchQuery}`}
        className="pl-1 font-medium text-foreground hover:underline transition-all duration-200"
      >
        {t('Sign in')}
      </Link>
    </div>
  ) : (
    <div className="mt-6 text-center text-[14px] text-muted-foreground">
      {t("Don't have an account?")}
      <Link
        to={`/sign-up?${searchQuery}`}
        className="pl-1 font-medium text-foreground hover:underline transition-all duration-200"
      >
        {t('Sign up')}
      </Link>
    </div>
  );
};

const TermsFooter = () => {
  const { data: termsOfServiceUrl } = flagsHooks.useFlag<string>(
    IbFlagId.TERMS_OF_SERVICE_URL,
  );
  const { data: privacyPolicyUrl } = flagsHooks.useFlag<string>(
    IbFlagId.PRIVACY_POLICY_URL,
  );
  const { data: edition } = flagsHooks.useFlag<IbEdition>(IbFlagId.EDITION);

  if (
    edition !== IbEdition.CLOUD ||
    (!termsOfServiceUrl && !privacyPolicyUrl)
  ) {
    return null;
  }

  return (
    <div className="text-center text-xs text-muted-foreground">
      {t('By continuing, you agree to our')}
      {termsOfServiceUrl && (
        <Link
          to={termsOfServiceUrl}
          target="_blank"
          className="px-1 text-muted-foreground underline hover:text-primary text-xs transition-all duration-200"
        >
          {t('Terms of Service')}
        </Link>
      )}
      {termsOfServiceUrl && privacyPolicyUrl && t('and')}
      {privacyPolicyUrl && (
        <Link
          to={privacyPolicyUrl}
          target="_blank"
          className="pl-1 text-muted-foreground underline hover:text-primary text-xs transition-all duration-200"
        >
          {t('Privacy Policy')}
        </Link>
      )}
      .
    </div>
  );
};

const AuthSeparator = ({
  isEmailAuthEnabled,
}: {
  isEmailAuthEnabled: boolean;
}) => {
  const { data: thirdPartyAuthProviders } =
    flagsHooks.useFlag<ThirdPartyAuthnProvidersToShowMap>(
      IbFlagId.THIRD_PARTY_AUTH_PROVIDERS_TO_SHOW_MAP,
    );
  const { data: edition } = flagsHooks.useFlag<IbEdition>(IbFlagId.EDITION);
  const isCloud = edition === IbEdition.CLOUD;
  const hasThirdPartyLogin =
    thirdPartyAuthProviders?.google || thirdPartyAuthProviders?.saml || isCloud;

  return hasThirdPartyLogin && isEmailAuthEnabled ? (
    <HorizontalSeparatorWithText className="my-5 text-muted-foreground">
      {t('or')}
    </HorizontalSeparatorWithText>
  ) : null;
};

/**
 * Brand device for the auth card: a miniature three-step pipeline (trigger → agent → done)
 * with a single data-dot traveling across it. Decorative only.
 */
const PipelineMotif = () => (
  <div
    className="relative mx-auto mb-5 flex w-fit items-center"
    aria-hidden="true"
  >
    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-amber-500">
      <Zap className="h-3.5 w-3.5" />
    </div>
    <div className="h-px w-9 bg-gray-200" />
    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-primary">
      <Bot className="h-3.5 w-3.5" />
    </div>
    <div className="h-px w-9 bg-gray-200" />
    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-emerald-600">
      <Check className="h-3.5 w-3.5" />
    </div>
    <span className="auth-scene-runner absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary" />
  </div>
);

/**
 * Auth page shell — a single centered column over a builder-canvas dot grid (white ground).
 * The sign-up page additionally renders the automation scene around the form. Purely
 * presentational: all form logic, flags, and redirects are owned by the children.
 */
const AuthLayout = ({
  children,
  isSignUp,
}: {
  children: React.ReactNode;
  isSignUp?: boolean;
}) => {
  const { setForceLightMode } = useTheme();
  useEffect(() => {
    setForceLightMode(true);
    return () => setForceLightMode(false);
  }, [setForceLightMode]);
  return (
    <div className="relative h-screen w-full overflow-hidden bg-white">
      {/* Builder-canvas dot grid, faded out under the centered form */}
      <div className="auth-scene-grid absolute inset-0" aria-hidden="true" />

      {/* Logo — top left */}
      <div className="absolute left-0 top-0 z-20 p-6">
        <FullLogo />
      </div>

      {/* Sign-up: the automation converges around the centered form */}
      {isSignUp && <SignupAutomationScene />}

      {/* Centered form column (both pages) */}
      <div className="relative z-10 flex h-full items-center justify-center px-4 py-16">
        <div className="flex max-h-full w-full max-w-[420px] flex-col">
          <div className="overflow-y-auto rounded-2xl border border-gray-200/90 bg-white px-8 py-8 shadow-[0_24px_60px_-16px_rgba(31,41,51,0.16)]">
            {children}
          </div>
          {isSignUp && (
            <div className="pt-4">
              <TermsFooter />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

AuthLayout.displayName = 'AuthLayout';

const AuthFormTemplate = React.memo(
  ({ form }: { form: 'signin' | 'signup' }) => {
    const isSignUp = form === 'signup';
    const token = authenticationSession.getToken();
    const redirectAfterLogin = useRedirectAfterLogin();
    const [showCheckYourEmailNote, setShowCheckYourEmailNote] = useState(false);
    const [showSamlLogin, setShowSamlLogin] = useState(false);
    const { data: isEmailAuthEnabled } = flagsHooks.useFlag<boolean>(
      IbFlagId.EMAIL_AUTH_ENABLED,
    );
    const data = {
      signin: {
        title: t('Welcome back'),
        description: t('Sign in to pick up where you left off.'),
      },
      signup: {
        title: t('Create a new account'),
        description: t('Join thousands of teams running on autopilot.'),
      },
    }[form];

    useEffect(() => {
      if (token) {
        redirectAfterLogin();
      }
    }, [token, redirectAfterLogin]);

    if (token) {
      return null;
    }

    if (showSamlLogin) {
      return (
        <AuthLayout isSignUp={isSignUp}>
          <PipelineMotif />
          <div className="mb-6 text-center">
            <h1 className="font-sentient text-[26px] font-bold tracking-tight text-gray-900">
              {t('Sign in with SAML')}
            </h1>
          </div>
          <SamlLoginForm onBack={() => setShowSamlLogin(false)} />
        </AuthLayout>
      );
    }

    return (
      <AuthLayout isSignUp={isSignUp}>
        {!showCheckYourEmailNote && (
          <>
            <PipelineMotif />
            <div className="mb-6 text-center">
              <h1 className="font-sentient text-[26px] font-bold tracking-tight text-gray-900">
                {data.title}
              </h1>
              <p className="mt-1.5 text-[13.5px] leading-snug text-muted-foreground">
                {data.description}
              </p>
            </div>
          </>
        )}

        {!showCheckYourEmailNote && (
          <ThirdPartyLogin
            isSignUp={isSignUp}
            onSamlClick={() => setShowSamlLogin(true)}
          />
        )}
        <AuthSeparator
          isEmailAuthEnabled={
            (isEmailAuthEnabled ?? true) && !showCheckYourEmailNote
          }
        />

        {isEmailAuthEnabled ? (
          isSignUp ? (
            <SignUpForm
              setShowCheckYourEmailNote={setShowCheckYourEmailNote}
              showCheckYourEmailNote={showCheckYourEmailNote}
            />
          ) : (
            <SignInForm />
          )
        ) : null}

        <BottomNote isSignup={isSignUp} />
      </AuthLayout>
    );
  },
);

AuthFormTemplate.displayName = 'AuthFormTemplate';

export { AuthFormTemplate, AuthLayout };
