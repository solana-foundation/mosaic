import { CustomTokenOptions, CustomTokenCreationResult } from '@/types/token';
import { CustomTokenBasicParams } from './custom-token-basic-params';
import { CustomTokenExtensionSelector } from './custom-token-extension-selector';
import { CustomTokenAuthorityParams } from './custom-token-authority-params';
import { CustomTokenCreationResultDisplay } from './custom-token-creation-result';
import { createCustomToken } from '@/features/token-creation/lib/custom-token';
import type { TransactionModifyingSigner } from '@solana/kit';
import { useTokenCreationForm } from '@/features/token-creation/hooks/use-token-creation-form';
import { TokenCreateFormBase } from '../token-create-form-base';
import { Step } from '../form-stepper';

interface CustomTokenCreateFormProps {
    transactionSendingSigner: TransactionModifyingSigner<string>;
    rpcUrl?: string;
    onTokenCreated?: () => void;
    onCancel?: () => void;
}

const STEPS: Step[] = [
    { id: 'identity', label: 'Token Identity' },
    { id: 'extensions', label: 'Extensions' },
    { id: 'authorities', label: 'Authorities' },
];

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
    mintAuthority: '',
    metadataAuthority: '',
    pausableAuthority: '',
    permanentDelegateAuthority: '',
    confidentialBalancesAuthority: '',
    scaledUiAmountAuthority: '',
    scaledUiAmountMultiplier: '1',
    scaledUiAmountNewMultiplier: '1',
    defaultAccountStateInitialized: true,
    freezeAuthority: '',
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
        transactionSendingSigner,
        rpcUrl,
        onTokenCreated,
    });

    return (
        <TokenCreateFormBase
            steps={STEPS}
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
                        return <CustomTokenAuthorityParams options={options} onInputChange={setOption} alwaysExpanded />;
                    default:
                        return null;
                }
            }}
            renderResult={result => <CustomTokenCreationResultDisplay result={result} />}
        />
    );
}
