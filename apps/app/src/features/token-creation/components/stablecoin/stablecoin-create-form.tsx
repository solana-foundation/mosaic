import { StablecoinOptions, StablecoinCreationResult } from '@/types/token';
import { StablecoinBasicParams } from './stablecoin-basic-params';
import { StablecoinFeaturesStep } from './stablecoin-features-step';
import { StablecoinCreationResultDisplay } from './stablecoin-creation-result';
import { createStablecoin } from '@/features/token-creation/lib/stablecoin';
import type { TransactionModifyingSigner } from '@solana/kit';
import { useTokenCreationForm } from '@/features/token-creation/hooks/use-token-creation-form';
import { TokenCreateFormBase } from '../token-create-form-base';
import { Step } from '../form-stepper';

interface StablecoinCreateFormProps {
    transactionSendingSigner: TransactionModifyingSigner<string>;
    rpcUrl?: string;
    onTokenCreated?: () => void;
    onCancel?: () => void;
}

const STEPS: Step[] = [
    { id: 'identity', label: 'Token Identity' },
    { id: 'features', label: 'Features' },
];

const INITIAL_OPTIONS: StablecoinOptions = {
    name: '',
    symbol: '',
    decimals: '6',
    uri: '',
    enableSrfc37: false,
    aclMode: 'blocklist',
    mintAuthority: '',
    metadataAuthority: '',
    pausableAuthority: '',
    confidentialBalancesAuthority: '',
    permanentDelegateAuthority: '',
};

export function StablecoinCreateForm({
    transactionSendingSigner,
    rpcUrl,
    onTokenCreated,
    onCancel,
}: StablecoinCreateFormProps) {
    const formState = useTokenCreationForm<StablecoinOptions, StablecoinCreationResult>({
        initialOptions: INITIAL_OPTIONS,
        createToken: createStablecoin,
        templateId: 'stablecoin',
        totalSteps: 2,
        transactionSendingSigner,
        rpcUrl,
        onTokenCreated,
    });

    return (
        <TokenCreateFormBase
            steps={STEPS}
            submitLabel="Create Stablecoin"
            onCancel={onCancel}
            {...formState}
            renderStep={(step, options, setOption) => {
                switch (step) {
                    case 0:
                        return <StablecoinBasicParams options={options} onInputChange={setOption} />;
                    case 1:
                        return <StablecoinFeaturesStep options={options} onInputChange={setOption} />;
                    default:
                        return null;
                }
            }}
            renderResult={result => <StablecoinCreationResultDisplay result={result} />}
        />
    );
}
