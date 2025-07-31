import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StablecoinOptions, StablecoinCreationResult } from '@/types/token';
import { StablecoinBasicParams } from './StablecoinBasicParams';
import { StablecoinAuthorityParams } from './StablecoinAuthorityParams';
import { StablecoinCreationResultDisplay } from '@/app/dashboard/create/stablecoin/StablecoinCreationResult';
import { createStablecoin } from '@/lib/stablecoin';
import { TransactionSendingSigner } from '@solana/signers';

interface StablecoinCreateFormProps {
  transactionSendingSigner: TransactionSendingSigner<string>;
}

export function StablecoinCreateForm({
  transactionSendingSigner,
}: StablecoinCreateFormProps) {
  const [stablecoinOptions, setStablecoinOptions] = useState<StablecoinOptions>(
    {
      name: '',
      symbol: '',
      decimals: '6',
      uri: '',
      mintAuthority: '',
      metadataAuthority: '',
      pausableAuthority: '',
      confidentialBalancesAuthority: '',
      permanentDelegateAuthority: '',
    }
  );
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<StablecoinCreationResult | null>(null);

  const handleInputChange = (field: string, value: string) => {
    setStablecoinOptions(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsCreating(true);
    setResult(null);

    try {
      const result = await createStablecoin(
        stablecoinOptions,
        transactionSendingSigner
      );
      setResult({
        success: true,
        mintAddress: result.mintAddress,
        transactionSignature: result.transactionSignature,
        details: {
          ...stablecoinOptions,
          decimals: parseInt(stablecoinOptions.decimals),
          mintAuthority: stablecoinOptions.mintAuthority || '',
          metadataAuthority: stablecoinOptions.metadataAuthority || '',
          pausableAuthority: stablecoinOptions.pausableAuthority || '',
          confidentialBalancesAuthority:
            stablecoinOptions.confidentialBalancesAuthority || '',
          permanentDelegateAuthority:
            stablecoinOptions.permanentDelegateAuthority || '',
          extensions: ['stablecoin'],
        },
      });
    } catch (error) {
      setResult({
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleReset = () => {
    setStablecoinOptions({
      name: '',
      symbol: '',
      decimals: '6',
      uri: '',
      mintAuthority: '',
      metadataAuthority: '',
      pausableAuthority: '',
      confidentialBalancesAuthority: '',
      permanentDelegateAuthority: '',
    });
    setResult(null);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <StablecoinBasicParams
          options={stablecoinOptions}
          onInputChange={handleInputChange}
        />

        <StablecoinAuthorityParams
          options={stablecoinOptions}
          onInputChange={handleInputChange}
        />

        {result && <StablecoinCreationResultDisplay result={result} />}

        <div className="flex gap-4">
          <Button
            type="submit"
            className="flex-1"
            disabled={
              isCreating ||
              !stablecoinOptions.name ||
              !stablecoinOptions.symbol ||
              !stablecoinOptions.decimals
            }
          >
            {isCreating ? 'Creating Stablecoin...' : 'Create Stablecoin'}
          </Button>
          <Button type="button" variant="outline" onClick={handleReset}>
            Reset
          </Button>
        </div>
      </form>
    </>
  );
}
