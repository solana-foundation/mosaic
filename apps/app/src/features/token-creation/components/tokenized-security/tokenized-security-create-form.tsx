import { TokenizedSecurityOptions, TokenizedSecurityCreationResult } from '@/types/token';
import { TokenizedSecurityBasicParams } from './tokenized-security-basic-params';
import { TokenizedSecurityFeaturesStep } from './tokenized-security-features-step';
import { TokenizedSecurityCreationResultDisplay } from './tokenized-security-creation-result';
import { createTokenizedSecurity } from '@/features/token-creation/lib/tokenized-security';
import type { TransactionModifyingSigner } from '@solana/kit';
import { useTokenCreationForm } from '@/features/token-creation/hooks/use-token-creation-form';
import { TokenCreateFormBase } from '../token-create-form-base';
import { Step } from '../form-stepper';

interface TokenizedSecurityCreateFormProps {
    transactionSendingSigner: TransactionModifyingSigner<string>;
    rpcUrl?: string;
    onTokenCreated?: () => void;
    onCancel?: () => void;
}

const STEPS: Step[] = [
    { id: 'identity', label: 'Token Identity' },
    { id: 'features', label: 'Features' },
];

const INITIAL_OPTIONS: TokenizedSecurityOptions = {
    name: '',
    symbol: '',
    decimals: '6',
    uri: '',
    aclMode: 'blocklist',
    enableSrfc37: false,
    mintAuthority: '',
    metadataAuthority: '',
    pausableAuthority: '',
    confidentialBalancesAuthority: '',
    permanentDelegateAuthority: '',
    scaledUiAmountAuthority: '',
    multiplier: '1',
};

export function TokenizedSecurityCreateForm({
    transactionSendingSigner,
    rpcUrl,
    onTokenCreated,
    onCancel,
}: TokenizedSecurityCreateFormProps) {
    const formState = useTokenCreationForm<TokenizedSecurityOptions, TokenizedSecurityCreationResult>({
        initialOptions: INITIAL_OPTIONS,
        createToken: createTokenizedSecurity,
        templateId: 'tokenized-security',
        totalSteps: 2,
        transactionSendingSigner,
        rpcUrl,
        onTokenCreated,
    });

    return (
        <TokenCreateFormBase
            steps={STEPS}
            submitLabel="Create Tokenized Security"
            onCancel={onCancel}
            {...formState}
            renderStep={(step, options, setOption) => {
                switch (step) {
                    case 0:
                        return (
                            <TokenizedSecurityBasicParams
                                options={options}
                                onInputChange={setOption as (field: keyof TokenizedSecurityOptions, value: string | boolean) => void}
                            />
                        );
                    case 1:
                        return (
                            <TokenizedSecurityFeaturesStep
                                options={options}
                                onInputChange={setOption as (field: keyof TokenizedSecurityOptions, value: string | boolean) => void}
                            />
                        );
                    default:
                        return null;
                }
            }}
            renderResult={result => <TokenizedSecurityCreationResultDisplay result={result} />}
        />
    );
}
