'use client';

import { useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { templates, type Template } from './templates';
import { useConnectorSigner } from '@/hooks/use-connector-signer';
import { useConnector } from '@solana/connector/react';
import { StablecoinCreateForm } from '@/app/create/stablecoin/stablecoin-create-form';
import { ArcadeTokenCreateForm } from '@/app/create/arcade-token/arcade-token-create-form';
import { TokenizedSecurityCreateForm } from '@/app/create/tokenized-security/tokenized-security-create-form';
import { CustomTokenCreateForm } from '@/app/create/custom-token/custom-token-create-form';
import { cn } from '@/lib/utils';

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

        switch (selectedTemplate.href) {
            case '/create/stablecoin':
                return <StablecoinCreateForm transactionSendingSigner={transactionSendingSigner} rpcUrl={rpcUrl} onTokenCreated={handleTokenCreated} />;
            case '/create/arcade-token':
                return <ArcadeTokenCreateForm transactionSendingSigner={transactionSendingSigner} rpcUrl={rpcUrl} onTokenCreated={handleTokenCreated} />;
            case '/create/tokenized-security':
                return <TokenizedSecurityCreateForm transactionSendingSigner={transactionSendingSigner} rpcUrl={rpcUrl} onTokenCreated={handleTokenCreated} />;
            case '/create/custom-token':
                return <CustomTokenCreateForm transactionSendingSigner={transactionSendingSigner} rpcUrl={rpcUrl} onTokenCreated={handleTokenCreated} />;
            default:
                return null;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className={cn(
                "overflow-hidden sm:rounded-3xl p-0 gap-0 transition-all duration-300",
                selectedTemplate ? "max-w-3xl" : "max-w-xl"
            )}>
                <div className={cn(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    selectedTemplate ? "max-h-[90vh]" : "max-h-[700px]"
                )}>
                    <div className="overflow-y-auto max-h-[90vh]">
                        {!selectedTemplate ? (
                            <>
                                <div className="flex items-center justify-between p-6 pb-4 border-b">
                                    <DialogTitle className="text-xl font-semibold">Create New Token</DialogTitle>
                                    {/* The Close button is automatically rendered by DialogContent, but we can hide it via CSS or rely on it. 
                                        Shadcn's DialogContent includes a Close button absolute positioned. 
                                        We'll let the default close button handle the closing, but it might overlap our header if we aren't careful.
                                        The default close button is right-4 top-4.
                                    */}
                                </div>

                                <div className="p-6 space-y-4">
                                    {/* Custom Token - First */}
                                    {(() => {
                                        const customToken = templates.find(t => t.href === '/create/custom-token');
                                        if (!customToken) return null;
                                        const Icon = customToken.icon;
                                        return (
                                            <button
                                                key={customToken.href}
                                                onClick={() => handleTemplateSelect(customToken)}
                                                className="w-full cursor-pointer active:scale-[0.98] flex items-center gap-4 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 hover:shadow-sm transition-all bg-white dark:bg-card group text-left"
                                            >
                                                <div className={cn("p-3 rounded-xl shrink-0", customToken.colorClass)}>
                                                    <Icon className={cn("h-6 w-6", customToken.iconColorClass)} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-base mb-1">{customToken.title}</h4>
                                                    <p className="text-sm text-gray-500 leading-relaxed">
                                                        {customToken.description}
                                                    </p>
                                                </div>
                                                <div className="shrink-0 text-gray-300 group-hover:text-gray-400 transition-colors">
                                                    <ChevronRight className="h-6 w-6" />
                                                </div>
                                            </button>
                                        );
                                    })()}

                                    {/* Templates Label */}
                                    <div className="pt-2 pb-2">
                                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Templates</h3>
                                    </div>

                                    {/* Other Templates */}
                                    {templates
                                        .filter(template => template.href !== '/create/custom-token')
                                        .map((template) => {
                                            const Icon = template.icon;
                                            return (
                                                <button
                                                    key={template.href}
                                                    onClick={() => handleTemplateSelect(template)}
                                                    className="w-full cursor-pointer active:scale-[0.98] flex items-center gap-4 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 hover:shadow-sm transition-all bg-white dark:bg-card group text-left"
                                                    >
                                                    <div className={cn("p-3 rounded-xl shrink-0", template.colorClass)}>
                                                        <Icon className={cn("h-6 w-6", template.iconColorClass)} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-semibold text-base mb-1">{template.title}</h4>
                                                        <p className="text-sm text-gray-500 leading-relaxed">
                                                            {template.description}
                                                        </p>
                                                    </div>
                                                    <div className="shrink-0 text-gray-300 group-hover:text-gray-400 transition-colors">
                                                        <ChevronRight className="h-6 w-6" />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                </div>
                            </>
                        ) : (
                            <>
                                <DialogHeader className="p-6 pb-4 border-b">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleBack}
                                            className="h-8 w-8 p-0 -ml-2 mr-1"
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                        </Button>
                                        <div>
                                            <DialogTitle className="text-xl">Create {selectedTemplate.title}</DialogTitle>
                                            <DialogDescription>
                                                Configure your token parameters
                                            </DialogDescription>
                                        </div>
                                    </div>
                                </DialogHeader>

                                <div className="p-6">
                                    {renderForm()}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
