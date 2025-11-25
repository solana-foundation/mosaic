'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useConnector } from '@solana/connector/react';
import { useConnectorSigner } from '@/hooks/use-connector-signer';
import { CustomTokenCreateForm } from '@/app/create/custom-token/custom-token-create-form';

// Component that only renders when wallet is available
function CustomTokenCreateWithWallet() {
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
                        <h2 className="text-3xl font-bold mb-2">Create Custom Token</h2>
                        <p className="text-muted-foreground">Configure your token with full control over extensions</p>
                    </div>
                </div>

                <CustomTokenCreateForm transactionSendingSigner={transactionSendingSigner} />
            </div>
        </div>
    );
}

// Simple wrapper component that shows a message when wallet is not connected
function CustomTokenCreatePage() {
    const { connected, selectedAccount, cluster } = useConnector();

    // If wallet is connected and chain is available, render the full component
    if (connected && selectedAccount && cluster) {
        return <CustomTokenCreateWithWallet />;
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
                        <h2 className="text-3xl font-bold mb-2">Create Custom Token</h2>
                        <p className="text-muted-foreground">Configure your token with full control over extensions</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Wallet Required</CardTitle>
                        <CardDescription>Please connect your wallet to create a custom token</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">
                            To create a custom token, you need to connect a wallet first. Please use the wallet connection
                            button in the top navigation.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default CustomTokenCreatePage;





