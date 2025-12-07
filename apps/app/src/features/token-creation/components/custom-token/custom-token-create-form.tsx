import { CustomTokenOptions, CustomTokenCreationResult } from '@/types/token';
import { CustomTokenBasicParams } from './custom-token-basic-params';
import {
    CustomTokenExtensionSelector,
    hasExtensionConflicts,
    hasExtensionsRequiringConfig,
} from './custom-token-extension-selector';
import { CustomTokenExtensionConfig } from './custom-token-extension-config';
import { CustomTokenCreationResultDisplay } from './custom-token-creation-result';
import { createCustomToken } from '@/features/token-creation/lib/custom-token';
import type { TransactionModifyingSigner } from '@solana/kit';
import { useTokenCreationForm } from '@/features/token-creation/hooks/use-token-creation-form';
import { TokenCreateFormBase } from '../token-create-form-base';
import { Step } from '../form-stepper';

const STEPS_BASE: Step[] = [
    { id: 'identity', label: 'Token Identity' },
    { id: 'extensions', label: 'Extensions' },
];

const STEP_CONFIG: Step = { id: 'config', label: 'Configuration' };

function getSteps(options: CustomTokenOptions): Step[] {
    if (hasExtensionsRequiringConfig(options)) {
        return [...STEPS_BASE, STEP_CONFIG];
    }
    return STEPS_BASE;
}

function getTotalSteps(options: CustomTokenOptions): number {
    return hasExtensionsRequiringConfig(options) ? 3 : 2;
}

function canProceed(step: number, options: CustomTokenOptions): boolean {
    // Step 0: Basic params validation
    if (step === 0) {
        return !!(options.name && options.symbol && options.decimals);
    }
    // Step 1: Extensions - check for conflicts
    if (step === 1) {
        return !hasExtensionConflicts(options);
    }
    // Step 2: Configuration - validate required fields for enabled extensions
    if (step === 2) {
        // Transfer Hook requires a program ID
        if (options.enableTransferHook && !options.transferHookProgramId?.trim()) {
            return false;
        }
    }
    return true;
}

interface CustomTokenCreateFormProps {
    transactionSendingSigner: TransactionModifyingSigner<string>;
    rpcUrl?: string;
    onTokenCreated?: () => void;
    onCancel?: () => void;
}

const INITIAL_OPTIONS: CustomTokenOptions = {
    name: '',
    symbol: '',
    decimals: '6',
    uri: '',
    enableMetadata: true,
    enablePausable: false,
    enablePermanentDelegate: false,
    enableDefaultAccountState: false,
    enableConfidentialBalances: false,
    enableScaledUiAmount: false,
    enableSrfc37: false,
    aclMode: 'blocklist',
    scaledUiAmountMode: 'static',
    scaledUiAmountMultiplier: '1',
    scaledUiAmountNewMultiplier: '1',
    scaledUiAmountEffectiveTimestamp: '',
    defaultAccountStateInitialized: true,
};

export function CustomTokenCreateForm({
    transactionSendingSigner,
    rpcUrl,
    onTokenCreated,
    onCancel,
}: CustomTokenCreateFormProps) {
    const formState = useTokenCreationForm<CustomTokenOptions, CustomTokenCreationResult>({
        initialOptions: INITIAL_OPTIONS,
        createToken: createCustomToken,
        templateId: 'custom-token',
        getTotalSteps,
        canProceed,
        transactionSendingSigner,
        rpcUrl,
        onTokenCreated,
    });

    const steps = getSteps(formState.options);

    return (
        <TokenCreateFormBase
            steps={steps}
            submitLabel="Create Custom Token"
            onCancel={onCancel}
            {...formState}
            renderStep={(step, options, setOption) => {
                switch (step) {
                    case 0:
                        return <CustomTokenBasicParams options={options} onInputChange={setOption} />;
                    case 1:
                        return <CustomTokenExtensionSelector options={options} onInputChange={setOption} />;
                    case 2:
                        return <CustomTokenExtensionConfig options={options} onInputChange={setOption} />;
                    default:
                        return null;
                }
            }}
            renderResult={result => <CustomTokenCreationResultDisplay result={result} />}
        />
    );
}
