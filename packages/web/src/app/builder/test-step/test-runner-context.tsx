import {
  FlowAction,
  FlowActionType,
  FlowTrigger,
  FlowTriggerType,
} from '@intelblocks/shared';
import { useQueryClient } from '@tanstack/react-query';
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { ChatDrawerSource } from '@/app/builder/types';
import { blockSelectorUtils, blocksHooks } from '@/features/pieces';

import { DynamicPropertiesContext } from '../piece-properties/dynamic-properties-context';

import { McpToolTestingDialog } from './custom-test-step/mcp-tool-testing-dialog';
import TestWebhookDialog from './custom-test-step/test-webhook-dialog';
import {
  TestType,
  triggerEventUtils,
} from './test-trigger-section/trigger-event-utils';
import { testStepHooks } from './utils/test-step-hooks';

const ActionTestRunnerContext =
  createContext<ActionTestRunnerContextValue | null>(null);

const isReturnResponseAndWaitForWebhook = (step: FlowAction) =>
  step.type === FlowActionType.BLOCK &&
  step.settings.blockName === '@intelblocks/block-webhook' &&
  step.settings.actionName === 'return_response_and_wait_for_next_webhook';

const ActionTestRunnerProvider = ({
  step,
  children,
}: ActionTestRunnerProviderProps) => {
  const { mutate: testAction, isPending: isWaitingTestResult } =
    testStepHooks.useTestAction({ currentStep: step });
  const isStepBeingTested = useBuilderStateContext(
    (state) => state.isStepBeingTested,
  );
  const { isLoadingDynamicProperties } = useContext(DynamicPropertiesContext);
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);

  const isTesting =
    isWaitingTestResult || isStepBeingTested(step.name) || showWebhookDialog;

  const canFireTest =
    step.valid !== false && !isTesting && !isLoadingDynamicProperties;

  const fireTest = useCallback(() => {
    if (!canFireTest) return;
    if (isReturnResponseAndWaitForWebhook(step)) {
      setShowWebhookDialog(true);
    } else {
      testAction(undefined);
    }
  }, [canFireTest, step, testAction]);

  return (
    <ActionTestRunnerContext.Provider
      value={{ fireTest, isTesting, canFireTest }}
    >
      {children}
      {showWebhookDialog && (
        <TestWebhookDialog
          testingMode="returnResponseAndWaitForNextWebhook"
          open={true}
          onOpenChange={(open) => !open && setShowWebhookDialog(false)}
          currentStep={step}
        />
      )}
    </ActionTestRunnerContext.Provider>
  );
};

const useActionTestRunner = () => useContext(ActionTestRunnerContext);

ActionTestRunnerProvider.displayName = 'ActionTestRunnerProvider';

const TriggerTestRunnerContext =
  createContext<TriggerTestRunnerContextValue | null>(null);

const TriggerTestRunnerProvider = ({
  step,
  children,
}: TriggerTestRunnerProviderProps) => {
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [isTestingDialogOpen, setIsTestingDialogOpen] = useState(false);
  const abortControllerRef = useRef<AbortController>(new AbortController());

  const [setChatDrawerOpenSource, flowVersionId] = useBuilderStateContext(
    (state) => [state.setChatDrawerOpenSource, state.flowVersion.id],
  );
  const { isLoadingDynamicProperties } = useContext(DynamicPropertiesContext);
  const queryClient = useQueryClient();

  const isBlockTrigger = step.type === FlowTriggerType.BLOCK;
  const blockName = isBlockTrigger ? step.settings.blockName : '';
  const blockVersion = isBlockTrigger ? step.settings.blockVersion : undefined;
  const triggerName = isBlockTrigger ? step.settings.triggerName : undefined;

  const { blockModel, isLoading: isBlockLoading } = blocksHooks.useBlock({
    name: blockName,
    version: blockVersion,
    enabled: isBlockTrigger && !!blockName,
  });

  const trigger = triggerName ? blockModel?.triggers?.[triggerName] : undefined;
  const mockData = trigger?.sampleData;

  const testType: TestType | null =
    trigger && triggerName && blockName
      ? triggerEventUtils.getTestType({ triggerName, blockName, trigger })
      : null;

  const isManualTrigger =
    blockName && triggerName
      ? blockSelectorUtils.isManualTrigger({ blockName, triggerName })
      : false;

  const onTestSuccess = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['triggerEvents', flowVersionId],
    });
  }, [queryClient, flowVersionId]);

  const { mutate: saveMockAsSampleData, isPending: isSavingMockdata } =
    testStepHooks.useSaveMockData({
      onSuccess: onTestSuccess,
    });

  const {
    mutate: simulateTrigger,
    isPending: isSimulating,
    reset: resetSimulation,
  } = testStepHooks.useSimulateTrigger({
    setErrorMessage,
    onSuccess: async () => {
      await onTestSuccess();
      setIsTestingDialogOpen(false);
    },
  });

  const { mutate: pollTrigger, isPending: isPollingTesting } =
    testStepHooks.usePollTrigger({
      setErrorMessage,
      onSuccess: onTestSuccess,
    });

  const isTesting =
    isSimulating || isPollingTesting || isSavingMockdata || isTestingDialogOpen;

  const isValid = step.valid !== false;
  const canFireTest =
    isValid &&
    !isTesting &&
    !isLoadingDynamicProperties &&
    !isBlockLoading &&
    !isManualTrigger &&
    testType !== null;

  const fireTest = useCallback(() => {
    if (!canFireTest || !testType) return;
    switch (testType) {
      case 'chat-trigger':
        setChatDrawerOpenSource(ChatDrawerSource.TEST_STEP);
        simulateTrigger(abortControllerRef.current.signal);
        break;
      case 'simulation':
      case 'webhook':
        simulateTrigger(abortControllerRef.current.signal);
        break;
      case 'polling':
        pollTrigger();
        break;
      case 'mcp-tool':
        setIsTestingDialogOpen(true);
        break;
    }
  }, [
    canFireTest,
    testType,
    simulateTrigger,
    pollTrigger,
    setChatDrawerOpenSource,
  ]);

  return (
    <TriggerTestRunnerContext.Provider
      value={{
        step,
        blockModel,
        isBlockLoading,
        testType,
        mockData,
        isValid,
        canFireTest,
        isTesting,
        isSimulating,
        isSavingMockdata,
        isPollingTesting,
        errorMessage,
        setErrorMessage,
        isTestingDialogOpen,
        setIsTestingDialogOpen,
        abortControllerRef,
        simulateTrigger,
        pollTrigger,
        saveMockAsSampleData,
        resetSimulation,
        fireTest,
        onTestSuccess,
      }}
    >
      {children}
      {testType === 'mcp-tool' && (
        <McpToolTestingDialog
          open={isTestingDialogOpen}
          onOpenChange={setIsTestingDialogOpen}
          onTestingSuccess={onTestSuccess}
        />
      )}
    </TriggerTestRunnerContext.Provider>
  );
};

const useTriggerTestRunner = () => useContext(TriggerTestRunnerContext);

TriggerTestRunnerProvider.displayName = 'TriggerTestRunnerProvider';

export {
  ActionTestRunnerProvider,
  useActionTestRunner,
  TriggerTestRunnerProvider,
  useTriggerTestRunner,
};

type ActionTestRunnerContextValue = {
  fireTest: () => void;
  isTesting: boolean;
  canFireTest: boolean;
};

type ActionTestRunnerProviderProps = {
  step: FlowAction;
  children: React.ReactNode;
};

type TriggerTestRunnerContextValue = {
  step: FlowTrigger;
  blockModel: ReturnType<typeof blocksHooks.useBlock>['blockModel'];
  isBlockLoading: boolean;
  testType: TestType | null;
  mockData: unknown;
  isValid: boolean;
  canFireTest: boolean;
  isTesting: boolean;
  isSimulating: boolean;
  isSavingMockdata: boolean;
  isPollingTesting: boolean;
  errorMessage: string | undefined;
  setErrorMessage: (msg: string | undefined) => void;
  isTestingDialogOpen: boolean;
  setIsTestingDialogOpen: (open: boolean) => void;
  abortControllerRef: React.MutableRefObject<AbortController>;
  simulateTrigger: (signal: AbortSignal) => void;
  pollTrigger: () => void;
  saveMockAsSampleData: (mockData: unknown) => void;
  resetSimulation: () => void;
  fireTest: () => void;
  onTestSuccess: () => Promise<void>;
};

type TriggerTestRunnerProviderProps = {
  step: FlowTrigger;
  children: React.ReactNode;
};
