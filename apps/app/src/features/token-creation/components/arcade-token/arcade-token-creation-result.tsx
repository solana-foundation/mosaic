'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gamepad2, CheckCircle } from 'lucide-react';
import { CopyableExplorerField } from '@/components/copyable-explorer-field';
import { ArcadeTokenCreationResult } from '@/types/token';
import { useCluster } from '@solana/connector/react';
import { getEffectiveClusterName } from '@/lib/solana/explorer';
import { CreationResultActions } from '../creation-result-actions';

interface ArcadeTokenCreationResultProps {
    result: ArcadeTokenCreationResult;
    cluster?: 'devnet' | 'testnet' | 'mainnet-beta';
    onClose?: () => void;
}

export function ArcadeTokenCreationResultDisplay({
    result,
    cluster: clusterProp,
    onClose,
}: ArcadeTokenCreationResultProps) {
    const { cluster: connectorCluster } = useCluster();
    const cluster = getEffectiveClusterName(clusterProp, connectorCluster) as 'devnet' | 'testnet' | 'mainnet-beta';
    return (
        <Card className="mb-8">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    {result.success ? (
                        <>
                            <Gamepad2 className="h-6 w-6 text-green-600" />
                            Arcade Token Created Successfully!
                        </>
                    ) : (
                        <>
                            <Gamepad2 className="h-6 w-6 text-red-600" />
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
                            Your arcade token has been successfully created with the following parameters:
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
                                <strong>ACL Mode:</strong> Allowlist
                            </div>
                            <div>
                                <strong>Extensions:</strong> {result.details?.extensions?.join(', ')}
                            </div>
                        </div>

                        <CreationResultActions mintAddress={result.mintAddress} onClose={onClose} />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="text-red-600">
                            <strong>Error:</strong> {result.error}
                        </div>
                        <CreationResultActions onClose={onClose} closeLabel="Close" />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
