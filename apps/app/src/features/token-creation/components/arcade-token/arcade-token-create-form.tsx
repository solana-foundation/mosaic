import { ArcadeTokenOptions, ArcadeTokenCreationResult } from '@/types/token';
import { ArcadeTokenBasicParams } from './arcade-token-basic-params';
import { ArcadeTokenFeaturesStep } from './arcade-token-features-step';
import { ArcadeTokenCreationResultDisplay } from './arcade-token-creation-result';
import { createArcadeToken } from '@/features/token-creation/lib/arcade-token';
import type { TransactionModifyingSigner } from '@solana/kit';
import { useTokenCreationForm } from '@/features/token-creation/hooks/use-token-creation-form';
import { TokenCreateFormBase } from '../token-create-form-base';
import { Step } from '../form-stepper';

interface ArcadeTokenCreateFormProps {
    transactionSendingSigner: TransactionModifyingSigner<string>;
    rpcUrl?: string;
    onTokenCreated?: () => void;
    onCancel?: () => void;
}

const STEPS: Step[] = [
    { id: 'identity', label: 'Token Identity' },
    { id: 'features', label: 'Features' },
];

const INITIAL_OPTIONS: ArcadeTokenOptions = {
    name: '',
    symbol: '',
    decimals: '6',
    uri: '',
    enableSrfc37: false,
    mintAuthority: '',
    metadataAuthority: '',
    pausableAuthority: '',
    permanentDelegateAuthority: '',
};

export function ArcadeTokenCreateForm({
    transactionSendingSigner,
    rpcUrl,
    onTokenCreated,
    onCancel,
}: ArcadeTokenCreateFormProps) {
    const formState = useTokenCreationForm<ArcadeTokenOptions, ArcadeTokenCreationResult>({
        initialOptions: INITIAL_OPTIONS,
        createToken: createArcadeToken,
        templateId: 'arcade-token',
        totalSteps: 2,
        transactionSendingSigner,
        rpcUrl,
        onTokenCreated,
    });

    return (
        <TokenCreateFormBase
            steps={STEPS}
            submitLabel="Create Arcade Token"
            onCancel={onCancel}
            {...formState}
            renderStep={(step, options, setOption) => {
                switch (step) {
                    case 0:
                        return <ArcadeTokenBasicParams options={options} onInputChange={setOption} />;
                    case 1:
                        return <ArcadeTokenFeaturesStep />;
                    default:
                        return null;
                }
            }}
            renderResult={result => <ArcadeTokenCreationResultDisplay result={result} />}
        />
    );
}
