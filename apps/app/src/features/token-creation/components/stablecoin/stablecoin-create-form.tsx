import { StablecoinOptions, StablecoinCreationResult } from '@/types/token';
import { StablecoinBasicParams } from './stablecoin-basic-params';
import { StablecoinFeaturesStep } from './stablecoin-features-step';
import { StablecoinCreationResultDisplay } from './stablecoin-creation-result';
import { createStablecoin } from '@/features/token-creation/lib/stablecoin';
import type { TransactionModifyingSigner } from '@solana/kit';
import { useTokenCreationForm } from '@/features/token-creation/hooks/use-token-creation-form';
import { TokenCreateFormBase } from '../token-create-form-base';
import { Step } from '../form-stepper';
import { AuthorityParams, hasInvalidAuthority } from '../authority-params';
import { stablecoinAuthorityFields } from '../authority-fields';
import { isAuditorKeyInvalid } from '../confidential-balances-config';

interface StablecoinCreateFormProps {
    transactionSendingSigner: TransactionModifyingSigner<string>;
    rpcUrl?: string;
    onTokenCreated?: () => void;
    onCancel?: () => void;
    onClose?: () => void;
}

const STEPS: Step[] = [
    { id: 'identity', label: 'Token Identity' },
    { id: 'features', label: 'Features' },
    { id: 'authorities', label: 'Authorities' },
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
    freezeAuthority: '',
    // Matches the SDK default, so the mint is unchanged unless the user picks otherwise.
    confidentialBalancesPolicy: 'whitelist',
    auditorElgamalPubkey: '',
};

function canProceed(step: number, options: StablecoinOptions): boolean {
    if (step === 0) {
        return !!(options.name && options.symbol && options.decimals);
    }
    // Step 1 renders the confidential-balances card, so mirror its inline auditor-key error.
    if (step === 1) {
        return !isAuditorKeyInvalid(options.auditorElgamalPubkey);
    }
    if (step === 2) {
        return !hasInvalidAuthority(options, stablecoinAuthorityFields(options));
    }
    return true;
}

export function StablecoinCreateForm({
    transactionSendingSigner,
    rpcUrl,
    onTokenCreated,
    onCancel,
    onClose,
}: StablecoinCreateFormProps) {
    const formState = useTokenCreationForm<StablecoinOptions, StablecoinCreationResult>({
        initialOptions: INITIAL_OPTIONS,
        createToken: createStablecoin,
        templateId: 'stablecoin',
        totalSteps: 3,
        canProceed,
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
                    case 2:
                        return (
                            <AuthorityParams
                                idPrefix="stablecoin"
                                options={options}
                                fields={stablecoinAuthorityFields(options)}
                                onInputChange={setOption}
                                alwaysExpanded
                            />
                        );
                    default:
                        return null;
                }
            }}
            renderResult={result => <StablecoinCreationResultDisplay result={result} onClose={onClose} />}
        />
    );
}
