import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArcadeTokenOptions, ArcadeTokenCreationResult } from '@/types/token';
import { ArcadeTokenBasicParams } from './ArcadeTokenBasicParams';
import { ArcadeTokenAuthorityParams } from './ArcadeTokenAuthorityParams';
import { ArcadeTokenCreationResultDisplay } from '@/app/dashboard/create/arcade-token/ArcadeTokenCreationResult';
import { createArcadeToken } from '@/lib/issuance/arcadeToken';
import { TransactionSendingSigner } from '@solana/signers';
import {
  TokenStorage,
  createTokenDisplayFromResult,
} from '@/lib/token/tokenStorage';

interface ArcadeTokenCreateFormProps {
  transactionSendingSigner: TransactionSendingSigner<string>;
}

export function ArcadeTokenCreateForm({
  transactionSendingSigner,
}: ArcadeTokenCreateFormProps) {
  const [arcadeTokenOptions, setArcadeTokenOptions] =
    useState<ArcadeTokenOptions>({
      name: '',
      symbol: '',
      decimals: '6',
      uri: '',
      mintAuthority: '',
      metadataAuthority: '',
      pausableAuthority: '',
      permanentDelegateAuthority: '',
    });
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<ArcadeTokenCreationResult | null>(null);

  const handleInputChange = (field: string, value: string) => {
    setArcadeTokenOptions(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsCreating(true);
    setResult(null);

    try {
      const result = await createArcadeToken(
        arcadeTokenOptions,
        transactionSendingSigner
      );

      if (result.success && result.mintAddress) {
        // Create token display object
        const tokenDisplay = createTokenDisplayFromResult(
          result,
          'arcade-token',
          arcadeTokenOptions
        );

        // Save to local storage
        TokenStorage.saveToken(tokenDisplay);

        const addrValue: unknown = (transactionSendingSigner as {
          address?: unknown;
        }).address;
        const defaultAuthority =
          typeof addrValue === 'string'
            ? addrValue
            : typeof addrValue === 'object' && addrValue !== null && 'toString' in addrValue
            ? String((addrValue as { toString: () => string }).toString())
            : '';

        setResult({
          success: true,
          mintAddress: result.mintAddress,
          transactionSignature: result.transactionSignature,
          details: {
            ...arcadeTokenOptions,
            decimals: parseInt(arcadeTokenOptions.decimals),
            mintAuthority: arcadeTokenOptions.mintAuthority || defaultAuthority,
            metadataAuthority:
              arcadeTokenOptions.metadataAuthority || defaultAuthority,
            pausableAuthority:
              arcadeTokenOptions.pausableAuthority || defaultAuthority,
            permanentDelegateAuthority:
              arcadeTokenOptions.permanentDelegateAuthority || defaultAuthority,
            extensions: [
              'Metadata',
              'Pausable',
              'Default Account State (Allowlist)',
              'Permanent Delegate',
            ],
          },
        });
      } else {
        setResult({
          success: false,
          error: result.error || 'Unknown error occurred',
        });
      }
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
    setArcadeTokenOptions({
      name: '',
      symbol: '',
      decimals: '6',
      uri: '',
      mintAuthority: '',
      metadataAuthority: '',
      pausableAuthority: '',
      permanentDelegateAuthority: '',
    });
    setResult(null);
  };

  return (
    <>
      {result ? (
        <>
          <ArcadeTokenCreationResultDisplay result={result} />
          <div className="flex gap-4">
            <Button type="button" variant="outline" onClick={handleReset}>
              Create another arcade token
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <ArcadeTokenBasicParams
            options={arcadeTokenOptions}
            onInputChange={handleInputChange}
          />

          <ArcadeTokenAuthorityParams
            options={arcadeTokenOptions}
            onInputChange={handleInputChange}
          />

          <div className="flex gap-4">
            <Button
              type="submit"
              className="flex-1"
              disabled={
                isCreating ||
                !arcadeTokenOptions.name ||
                !arcadeTokenOptions.symbol ||
                !arcadeTokenOptions.decimals
              }
            >
              {isCreating ? 'Creating Arcade Token...' : 'Create Arcade Token'}
            </Button>
            <Button type="button" variant="outline" onClick={handleReset}>
              Reset
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
