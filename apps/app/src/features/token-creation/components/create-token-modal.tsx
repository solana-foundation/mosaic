'use client';

import { useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { templates, type Template } from '@/config/templates';
import { useConnectorSigner } from '@/features/wallet/hooks/use-connector-signer';
import { useConnector } from '@solana/connector/react';
import { StablecoinCreateForm } from './stablecoin/stablecoin-create-form';
import { ArcadeTokenCreateForm } from './arcade-token/arcade-token-create-form';
import { TokenizedSecurityCreateForm } from './tokenized-security/tokenized-security-create-form';
import { CustomTokenCreateForm } from './custom-token/custom-token-create-form';
import { cn } from '@/lib/utils';
// import { IconAppGiftFill } from 'symbols-react';

interface CreateTokenModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onTokenCreated?: () => void;
}

export function CreateTokenModal({ isOpen, onOpenChange, onTokenCreated }: CreateTokenModalProps) {
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const transactionSendingSigner = useConnectorSigner();
    const { cluster } = useConnector();

    // Get RPC URL from the current cluster
    const rpcUrl = cluster?.url || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

    const handleTemplateSelect = (template: Template) => {
        setSelectedTemplate(template);
    };

    const handleBack = () => {
        setSelectedTemplate(null);
    };

    const handleClose = () => {
        setSelectedTemplate(null);
        onOpenChange(false);
    };

    const handleTokenCreated = () => {
        // Call the parent callback to refresh the dashboard
        onTokenCreated?.();
        // Close the modal
        handleClose();
    };

    const renderForm = () => {
        if (!transactionSendingSigner || !selectedTemplate) {
            return null;
        }

        switch (selectedTemplate.id) {
            case 'stablecoin':
                return (
                    <StablecoinCreateForm
                        transactionSendingSigner={transactionSendingSigner}
                        rpcUrl={rpcUrl}
                        onTokenCreated={handleTokenCreated}
                        onCancel={handleBack}
                    />
                );
            case 'arcade-token':
                return (
                    <ArcadeTokenCreateForm
                        transactionSendingSigner={transactionSendingSigner}
                        rpcUrl={rpcUrl}
                        onTokenCreated={handleTokenCreated}
                        onCancel={handleBack}
                    />
                );
            case 'tokenized-security':
                return (
                    <TokenizedSecurityCreateForm
                        transactionSendingSigner={transactionSendingSigner}
                        rpcUrl={rpcUrl}
                        onTokenCreated={handleTokenCreated}
                        onCancel={handleBack}
                    />
                );
            case 'custom-token':
                return (
                    <CustomTokenCreateForm
                        transactionSendingSigner={transactionSendingSigner}
                        rpcUrl={rpcUrl}
                        onTokenCreated={handleTokenCreated}
                        onCancel={handleBack}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent
                className={cn(
                    'overflow-hidden sm:rounded-3xl p-0 gap-0 transition-all duration-300 [&>button]:hidden',
                    selectedTemplate ? 'max-w-lg' : 'max-w-lg',
                )}
            >
                <div
                    className={cn(
                        'overflow-hidden transition-all duration-300 ease-in-out',
                        selectedTemplate ? 'max-h-auto' : 'max-h-[700px]',
                    )}
                >
                    <div className="overflow-y-auto max-h-[90vh] bg-primary/5">
                        {!selectedTemplate ? (
                            <>
                                <div className="flex items-center justify-between p-6 pb-4 border-b border-primary/5 bg-primary/5">
                                    <DialogTitle className="text-xl font-semibold">Create New Token</DialogTitle>
                                    <button
                                        onClick={handleClose}
                                        className="rounded-full p-1.5 bg-primary/10 hover:bg-muted transition-colors cursor-pointer"
                                        aria-label="Close"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>

                                <div className="p-4.5 space-y-4">
                                    {/* Custom Token - First */}
                                    {(() => {
                                        const customToken = templates.find(t => t.id === 'custom-token');
                                        if (!customToken) return null;
                                        const Icon = customToken.icon;
                                        return (
                                            <button
                                                key={customToken.id}
                                                onClick={() => handleTemplateSelect(customToken)}
                                                className="w-full cursor-pointer active:scale-[0.98] flex items-center gap-4 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-200 hover:shadow-sm transition-all bg-white dark:bg-card group text-left"
                                            >
                                                <div className={cn('p-3 rounded-xl shrink-0', customToken.colorClass)}>
                                                    <Icon className={cn('h-6 w-6', customToken.iconColorClass)} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-base mb-1">
                                                        {customToken.title}
                                                    </h4>
                                                    <p className="text-sm text-gray-500 leading-relaxed">
                                                        {customToken.description}
                                                    </p>
                                                </div>
                                                <div className="shrink-0 text-gray-400 group-hover:text-gray-300 transition-colors">
                                                    <ChevronRight className="h-6 w-6" />
                                                </div>
                                            </button>
                                        );
                                    })()}

                                    {/* Templates Label */}
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 flex-col">
                                            <div className="w-full h-px bg-border mb-1" />
                                            <div className="w-full h-px bg-border mb-1" />
                                            <div className="w-full h-px bg-border" />
                                        </div>
                                        <span className="text-sm font-medium text-primary flex items-center gap-2">
                                            {/* <IconAppGiftFill className="h-4 w-4 fill-primary/30" /> */}
                                            Templates
                                        </span>
                                        <div className="flex-1 flex-col">
                                            <div className="w-full h-px bg-border mb-1" />
                                            <div className="w-full h-px bg-border mb-1" />
                                            <div className="w-full h-px bg-border" />
                                        </div>
                                    </div>

                                    {/* Other Templates */}
                                    {templates
                                        .filter(template => template.id !== 'custom-token')
                                        .map(template => {
                                            const Icon = template.icon;
                                            return (
                                                <button
                                                    key={template.id}
                                                    onClick={() => handleTemplateSelect(template)}
                                                    className="w-full cursor-pointer active:scale-[0.98] flex items-center gap-4 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-200 hover:shadow-sm transition-all bg-white dark:bg-card group text-left"
                                                >
                                                    <div className={cn('p-3 rounded-xl shrink-0', template.colorClass)}>
                                                        <Icon className={cn('h-6 w-6', template.iconColorClass)} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-semibold text-base mb-1">
                                                            {template.title}
                                                        </h4>
                                                        <p className="text-sm text-gray-500 leading-relaxed">
                                                            {template.description}
                                                        </p>
                                                    </div>
                                                    <div className="shrink-0 text-gray-400 group-hover:text-gray-300 transition-colors">
                                                        <ChevronRight className="h-6 w-6" />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                </div>
                            </>
                        ) : (
                            <>
                                <DialogHeader className="p-6 pb-4 border-b border-primary/5 bg-primary/5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <DialogTitle className="text-xl">
                                                Create a {selectedTemplate.title}
                                            </DialogTitle>
                                            <DialogDescription>Configure your token parameters</DialogDescription>
                                        </div>
                                        <button
                                            onClick={handleClose}
                                            className="rounded-full p-1.5 bg-primary/10 hover:bg-muted transition-colors cursor-pointer"
                                            aria-label="Close"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </DialogHeader>

                                <div className="p-6">{renderForm()}</div>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
