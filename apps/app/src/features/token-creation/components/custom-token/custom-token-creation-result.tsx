import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, CheckCircle } from 'lucide-react';
import { CustomTokenCreationResult } from '@/types/token';
import Link from 'next/link';
import { CopyableExplorerField } from '@/components/copyable-explorer-field';

interface CustomTokenCreationResultProps {
    result: CustomTokenCreationResult;
    cluster?: 'devnet' | 'testnet' | 'mainnet-beta';
}

export function CustomTokenCreationResultDisplay({ result, cluster = 'devnet' }: CustomTokenCreationResultProps) {
    return (
        <Card className="mb-8">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    {result.success ? (
                        <>
                            <Settings className="h-6 w-6 text-green-600" />
                            Custom Token Created Successfully!
                        </>
                    ) : (
                        <>
                            <Settings className="h-6 w-6 text-red-600" />
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
                            cluster={cluster}
                        />
                        <CopyableExplorerField
                            label="Transaction"
                            value={result.transactionSignature}
                            kind="tx"
                            cluster={cluster}
                        />
                        <div className="text-sm text-muted-foreground">
                            Your custom token has been successfully created with the following parameters:
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
                            {result.details?.aclMode && (
                                <div>
                                    <strong>ACL Mode:</strong>{' '}
                                    {result.details.aclMode === 'allowlist' ? 'Allowlist' : 'Blocklist'}
                                </div>
                            )}
                            <div className="col-span-2">
                                <strong>Extensions:</strong> {result.details?.extensions?.join(', ') || 'None'}
                            </div>
                        </div>

                        {/* Transfer Fee Details */}
                        {result.details?.transferFeeBasisPoints !== undefined && (
                            <>
                                <div className="pt-2 text-sm text-muted-foreground">Transfer Fee Configuration</div>
                                <div className="grid grid-cols-2 gap-3 text-sm p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                    <div>
                                        <strong>Fee Rate:</strong>{' '}
                                        {(result.details.transferFeeBasisPoints / 100).toFixed(2)}%
                                        <span className="text-muted-foreground ml-1">
                                            ({result.details.transferFeeBasisPoints} bps)
                                        </span>
                                    </div>
                                    {result.details?.transferFeeMaximum && (
                                        <div>
                                            <strong>Maximum Fee:</strong> {result.details.transferFeeMaximum}
                                            <span className="text-muted-foreground ml-1">(smallest units)</span>
                                        </div>
                                    )}
                                    {result.details?.transferFeeAuthority && (
                                        <div className="col-span-2">
                                            <strong>Fee Authority:</strong>{' '}
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                                {result.details.transferFeeAuthority}
                                            </code>
                                        </div>
                                    )}
                                    {result.details?.withdrawWithheldAuthority && (
                                        <div className="col-span-2">
                                            <strong>Withdraw Authority:</strong>{' '}
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                                {result.details.withdrawWithheldAuthority}
                                            </code>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Interest Bearing Details */}
                        {result.details?.interestRate !== undefined && (
                            <>
                                <div className="pt-2 text-sm text-muted-foreground">Interest Bearing Configuration</div>
                                <div className="grid grid-cols-2 gap-3 text-sm p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <div>
                                        <strong>Annual Rate:</strong>{' '}
                                        {(result.details.interestRate / 100).toFixed(2)}%
                                        <span className="text-muted-foreground ml-1">
                                            ({result.details.interestRate} bps)
                                        </span>
                                    </div>
                                    {result.details?.interestBearingAuthority && (
                                        <div className="col-span-2">
                                            <strong>Rate Authority:</strong>{' '}
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                                {result.details.interestBearingAuthority}
                                            </code>
                                        </div>
                                    )}
                                    <div className="col-span-2 text-xs text-muted-foreground">
                                        Interest is displayed cosmetically only — no new tokens are minted.
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Transfer Hook Details */}
                        {result.details?.transferHookProgramId && (
                            <>
                                <div className="pt-2 text-sm text-muted-foreground">Transfer Hook Configuration</div>
                                <div className="grid grid-cols-1 gap-3 text-sm p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                    <div>
                                        <strong>Hook Program:</strong>{' '}
                                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                            {result.details.transferHookProgramId}
                                        </code>
                                    </div>
                                    {result.details?.transferHookAuthority && (
                                        <div>
                                            <strong>Hook Authority:</strong>{' '}
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                                {result.details.transferHookAuthority}
                                            </code>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Other Authorities */}
                        {(result.details?.metadataAuthority ||
                            result.details?.pausableAuthority ||
                            result.details?.permanentDelegateAuthority ||
                            result.details?.confidentialBalancesAuthority ||
                            result.details?.scaledUiAmountAuthority) && (
                            <>
                                <div className="pt-2 text-sm text-muted-foreground">Authorities</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    {result.details?.mintAuthority && (
                                        <div>
                                            <strong>Mint Authority:</strong>{' '}
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                                {result.details.mintAuthority}
                                            </code>
                                        </div>
                                    )}
                                    {result.details?.metadataAuthority && (
                                        <div>
                                            <strong>Metadata Authority:</strong>{' '}
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                                {result.details.metadataAuthority}
                                            </code>
                                        </div>
                                    )}
                                    {result.details?.pausableAuthority && (
                                        <div>
                                            <strong>Pausable Authority:</strong>{' '}
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                                {result.details.pausableAuthority}
                                            </code>
                                        </div>
                                    )}
                                    {result.details?.confidentialBalancesAuthority && (
                                        <div>
                                            <strong>Confidential Balances Authority:</strong>{' '}
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                                {result.details.confidentialBalancesAuthority}
                                            </code>
                                        </div>
                                    )}
                                    {result.details?.permanentDelegateAuthority && (
                                        <div>
                                            <strong>Permanent Delegate Authority:</strong>{' '}
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                                {result.details.permanentDelegateAuthority}
                                            </code>
                                        </div>
                                    )}
                                    {result.details?.scaledUiAmountAuthority && (
                                        <div>
                                            <strong>Scaled UI Amount Authority:</strong>{' '}
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                                {result.details.scaledUiAmountAuthority}
                                            </code>
                                        </div>
                                    )}
                                    {result.details?.scaledUiAmountMultiplier && (
                                        <div>
                                            <strong>Scaled UI Amount Multiplier:</strong>{' '}
                                            {result.details.scaledUiAmountMultiplier}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Manage Token Button */}
                        {result.mintAddress && (
                            <div className="pt-4 border-t">
                                <Link href={`/manage/${result.mintAddress}`}>
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
