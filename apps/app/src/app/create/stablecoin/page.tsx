'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { CreateTemplateSidebar } from '@/components/create-template-sidebar';
import { useConnector } from '@solana/connector/react';
import { useConnectorSigner } from '@/hooks/use-connector-signer';
import { StablecoinCreateForm } from '@/app/create/stablecoin/stablecoin-create-form';

// Component that only renders when wallet is available
function StablecoinCreateWithWallet({ rpcUrl }: { rpcUrl: string }) {
    // Use the connector signer hook which provides a gill-compatible transaction signer
    const transactionSendingSigner = useConnectorSigner();

    if (!transactionSendingSigner) {
        return null;
    }

    return (
        <div className="flex-1 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center mb-8">
                    <Link href="/create">
                        <Button variant="ghost" className="mr-4">
                            ← Back
                        </Button>
                    </Link>
                    <div>
                        <h2 className="text-3xl font-bold mb-2">Create Stablecoin</h2>
                        <p className="text-muted-foreground">Configure your stablecoin parameters</p>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">
                    <aside className="order-first lg:order-2 lg:w-80 shrink-0">
                        <CreateTemplateSidebar
                            description={
                                <>
                                    This stablecoin template is designed for regulatory-compliant issuance with strong
                                    controls and safety features.
                                </>
                            }
                            coreCapabilityKeys={[
                                'metadata',
                                'accessControls',
                                'pausable',
                                'permanentDelegate',
                                'confidentialBalances',
                                'confidentialMintBurn',
                            ]}
                            enabledExtensionKeys={[
                                'extMetadata',
                                'extPausable',
                                'extDefaultAccountStateAllowOrBlock',
                                'extConfidentialBalances',
                                'extPermanentDelegate',
                            ]}
                            standardKeys={['sRFC37', 'gatingProgram']}
                        />
                    </aside>
                    <div className="order-last lg:order-1 flex-1">
                        <StablecoinCreateForm transactionSendingSigner={transactionSendingSigner} rpcUrl={rpcUrl} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Simple wrapper component that shows a message when wallet is not connected
function StablecoinCreatePage() {
    const { connected, selectedAccount, cluster } = useConnector();

    // Get RPC URL from the current cluster
    const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

    // If wallet is connected and chain is available, render the full component
    if (connected && selectedAccount && cluster) {
        return <StablecoinCreateWithWallet rpcUrl={rpcUrl} />;
    }

    // Otherwise, show a message to connect wallet
    return (
        <div className="flex-1 p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center mb-8">
                    <Link href="/create">
                        <Button variant="ghost" className="mr-4">
                            ← Back
                        </Button>
                    </Link>
                    <div>
                        <h2 className="text-3xl font-bold mb-2">Create Stablecoin</h2>
                        <p className="text-muted-foreground">Configure your stablecoin parameters</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Wallet Required</CardTitle>
                        <CardDescription>Please connect your wallet to create a stablecoin</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">
                            To create a stablecoin, you need to connect a wallet first. Please use the wallet connection
                            button in the top navigation.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default StablecoinCreatePage;
