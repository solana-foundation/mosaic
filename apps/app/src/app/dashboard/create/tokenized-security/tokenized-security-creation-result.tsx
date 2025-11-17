import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Settings, CandlestickChart } from 'lucide-react';
import { CopyableExplorerField } from '@/components/copyable-explorer-field';
import { TokenizedSecurityCreationResult } from '@/types/token';
import Link from 'next/link';

export function TokenizedSecurityCreationResultDisplay({ result }: { result: TokenizedSecurityCreationResult }) {
    return (
        <Card className="mb-8">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    {result.success ? (
                        <>
                            <CandlestickChart className="h-6 w-6 text-green-600" />
                            Tokenized Security Created Successfully!
                        </>
                    ) : (
                        <>
                            <CandlestickChart className="h-6 w-6 text-red-600" />
                            Creation Failed
                        </>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {result.success ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            <span className="text-green-800 text-sm font-medium">
                                Token saved to your local storage and will appear on your dashboard
                            </span>
                        </div>
                        <CopyableExplorerField
                            label="Mint Address"
                            value={result.mintAddress}
                            kind="address"
                            cluster="devnet"
                        />
                        <CopyableExplorerField
                            label="Transaction"
                            value={result.transactionSignature}
                            kind="tx"
                            cluster="devnet"
                        />
                        <div className="text-sm text-muted-foreground">
                            Your tokenized security has been created with the following parameters:
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <strong>Name:</strong> {result.details?.name}
                            </div>
                            <div>
                                <strong>Symbol:</strong> {result.details?.symbol}
                            </div>
                            <div>
                                <strong>Decimals:</strong> {result.details?.decimals}
                            </div>
                            <div>
                                <strong>ACL Mode:</strong>{' '}
                                {result.details?.aclMode === 'allowlist' ? 'Allowlist' : 'Blocklist'}
                            </div>
                            <div>
                                <strong>Multiplier:</strong> {result.details?.multiplier}
                            </div>
                            <div className="col-span-2">
                                <strong>Extensions:</strong> {result.details?.extensions?.join(', ')}
                            </div>
                        </div>

                        <div className="pt-2 text-sm text-muted-foreground">Authorities</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div>
                                <strong>Mint Authority:</strong>{' '}
                                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                    {result.details?.mintAuthority}
                                </code>
                            </div>
                            <div>
                                <strong>Metadata Authority:</strong>{' '}
                                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                    {result.details?.metadataAuthority}
                                </code>
                            </div>
                            <div>
                                <strong>Pausable Authority:</strong>{' '}
                                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                    {result.details?.pausableAuthority}
                                </code>
                            </div>
                            <div>
                                <strong>Confidential Balances Authority:</strong>{' '}
                                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                    {result.details?.confidentialBalancesAuthority}
                                </code>
                            </div>
                            <div className="md:col-span-2">
                                <strong>Permanent Delegate Authority:</strong>{' '}
                                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                    {result.details?.permanentDelegateAuthority}
                                </code>
                            </div>
                        </div>

                        {result.mintAddress && (
                            <div className="pt-4 border-t">
                                <Link href={`/dashboard/manage/${result.mintAddress}`}>
                                    <Button className="w-full">
                                        <Settings className="h-4 w-4 mr-2" />
                                        Manage Token
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-red-600">
                        <strong>Error:</strong> {result.error}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
