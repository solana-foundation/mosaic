'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Gamepad2, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { ArcadeTokenOptions, ArcadeTokenCreationResult } from '@/types/token';
// import { createArcadeTokenForUI } from '@/lib/arcadeToken';
import { mockCreateArcadeTokenForUI } from '@/lib/mockFunctions';
import { useWallet } from '@solana/wallet-adapter-react';

export default function ArcadeTokenCreatePage() {
  const { publicKey, connected } = useWallet();
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
      mintKeypair: '',
      keypair: '',
    });
  const [showOptionalParams, setShowOptionalParams] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<ArcadeTokenCreationResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connected || !publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    setIsCreating(true);
    setResult(null);

    try {
      const result = await mockCreateArcadeTokenForUI(arcadeTokenOptions, {
        publicKey,
        connected: true,
      });
      setResult(result);

      if (result.success) {
        // console.log('Arcade token created successfully:', result);
      } else {
        // console.error('Failed to create arcade token:', result.error);
      }
    } catch (error) {
      // console.error('Error creating arcade token:', error);
      setResult({
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setArcadeTokenOptions(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="flex-1 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center mb-8">
          <Link href="/dashboard/create">
            <Button variant="ghost" className="mr-4">
              ← Back
            </Button>
          </Link>
          <div>
            <h2 className="text-3xl font-bold mb-2">Create Arcade Token</h2>
            <p className="text-muted-foreground">
              Configure your arcade token parameters
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center">
              <Gamepad2 className="h-8 w-8 text-primary mr-3" />
              <div>
                <CardTitle>Arcade Token Configuration</CardTitle>
                <CardDescription>
                  Fill in the required fields to create your gaming or utility
                  token
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                {/* Required Fields */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">
                    Required Parameters
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={arcadeTokenOptions.name}
                        onChange={e =>
                          handleInputChange('name', e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="Token Name"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Symbol *
                      </label>
                      <input
                        type="text"
                        value={arcadeTokenOptions.symbol}
                        onChange={e =>
                          handleInputChange('symbol', e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="TKN"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Decimals *
                      </label>
                      <input
                        type="number"
                        value={arcadeTokenOptions.decimals}
                        onChange={e =>
                          handleInputChange('decimals', e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="6"
                        min="0"
                        max="9"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Optional Parameters Dropdown */}
                <div className="border rounded-lg">
                  <button
                    type="button"
                    onClick={() => setShowOptionalParams(!showOptionalParams)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:scale-[1.01] transition-transform duration-200"
                  >
                    <span className="font-medium">Optional Parameters</span>
                    {showOptionalParams ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </button>

                  {showOptionalParams && (
                    <div className="px-4 pb-4 border-t">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Mint Authority
                          </label>
                          <input
                            type="text"
                            value={arcadeTokenOptions.mintAuthority}
                            onChange={e =>
                              handleInputChange('mintAuthority', e.target.value)
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="Public key"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Metadata Authority
                          </label>
                          <input
                            type="text"
                            value={arcadeTokenOptions.metadataAuthority}
                            onChange={e =>
                              handleInputChange(
                                'metadataAuthority',
                                e.target.value
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="Public key"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Pausable Authority
                          </label>
                          <input
                            type="text"
                            value={arcadeTokenOptions.pausableAuthority}
                            onChange={e =>
                              handleInputChange(
                                'pausableAuthority',
                                e.target.value
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="Public key"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Permanent Delegate Authority
                          </label>
                          <input
                            type="text"
                            value={
                              arcadeTokenOptions.permanentDelegateAuthority
                            }
                            onChange={e =>
                              handleInputChange(
                                'permanentDelegateAuthority',
                                e.target.value
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="Public key"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Mint Keypair
                          </label>
                          <input
                            type="text"
                            value={arcadeTokenOptions.mintKeypair}
                            onChange={e =>
                              handleInputChange('mintKeypair', e.target.value)
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="Base58 encoded keypair"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Keypair
                          </label>
                          <input
                            type="text"
                            value={arcadeTokenOptions.keypair}
                            onChange={e =>
                              handleInputChange('keypair', e.target.value)
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="Base58 encoded keypair"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <Button type="submit" className="px-8" disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create Arcade Token'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Result Display */}
        {result && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle
                className={result.success ? 'text-green-600' : 'text-red-600'}
              >
                {result.success
                  ? '✅ Arcade Token Creation Successful'
                  : '❌ Arcade Token Creation Failed'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.success ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">
                      📋 Details:
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium">Name:</span>{' '}
                        {result.details?.name}
                      </div>
                      <div>
                        <span className="font-medium">Symbol:</span>{' '}
                        {result.details?.symbol}
                      </div>
                      <div>
                        <span className="font-medium">Decimals:</span>{' '}
                        {result.details?.decimals}
                      </div>
                      <div>
                        <span className="font-medium">Mint Address:</span>{' '}
                        {result.mintAddress}
                      </div>
                      <div>
                        <span className="font-medium">Transaction:</span>{' '}
                        {result.transactionSignature}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">
                      🔐 Authorities:
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium">Mint Authority:</span>{' '}
                        {result.details?.mintAuthority}
                      </div>
                      <div>
                        <span className="font-medium">Metadata Authority:</span>{' '}
                        {result.details?.metadataAuthority}
                      </div>
                      <div>
                        <span className="font-medium">Pausable Authority:</span>{' '}
                        {result.details?.pausableAuthority}
                      </div>
                      <div>
                        <span className="font-medium">
                          Permanent Delegate Authority:
                        </span>{' '}
                        {result.details?.permanentDelegateAuthority}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">
                      🛡️ Token Extensions:
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {result.details?.extensions.map(
                        (ext: string, index: number) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs"
                          >
                            ✓ {ext}
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  {arcadeTokenOptions.uri && (
                    <div>
                      <span className="font-medium">Metadata URI:</span>{' '}
                      {arcadeTokenOptions.uri}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-red-600">
                  <p className="font-medium">Error:</p>
                  <p>{result.error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
