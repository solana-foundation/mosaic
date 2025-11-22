'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { CreateTemplateSidebar } from '@/components/create-template-sidebar';
import { useConnector } from '@solana/connector/react';
import { useConnectorSigner } from '@/hooks/use-connector-signer';
import { TokenizedSecurityCreateForm } from './tokenized-security-create-form';

function TokenizedSecurityCreateWithWallet() {
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
                        <h2 className="text-3xl font-bold mb-2">Create Tokenized Security</h2>
                        <p className="text-muted-foreground">Configure your tokenized security parameters</p>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">
                    <aside className="space-y-4 order-first lg:order-2 lg:w-80 shrink-0">
                        <CreateTemplateSidebar
                            description={<>A security token with the stablecoin feature set plus Scaled UI Amount.</>}
                            coreCapabilityKeys={[
                                'metadata',
                                'accessControls',
                                'pausable',
                                'permanentDelegate',
                                'confidentialBalances',
                                'scaledUIAmount',
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
                        <TokenizedSecurityCreateForm transactionSendingSigner={transactionSendingSigner} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function TokenizedSecurityCreatePage() {
    const { connected, selectedAccount, cluster } = useConnector();

    if (connected && selectedAccount && cluster) {
        return <TokenizedSecurityCreateWithWallet />;
    }

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
                        <h2 className="text-3xl font-bold mb-2">Create Tokenized Security</h2>
                        <p className="text-muted-foreground">Configure your tokenized security parameters</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Wallet Required</CardTitle>
                        <CardDescription>Please connect your wallet to create a tokenized security</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">
                            To create a tokenized security, you need to connect a wallet first. Please use the wallet
                            connection button in the top navigation.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
