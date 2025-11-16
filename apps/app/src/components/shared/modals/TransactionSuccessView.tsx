import { Button } from '@/components/ui/button';
import { ExternalLink, CheckCircle } from 'lucide-react';

interface TransactionSuccessViewProps {
    title: string;
    message: string;
    transactionSignature?: string;
    onClose: () => void;
    onContinue?: () => void;
    continueLabel?: string;
}

export function TransactionSuccessView({
    title,
    message,
    transactionSignature,
    onClose,
    onContinue,
    continueLabel = 'Continue',
}: TransactionSuccessViewProps) {
    return (
        <div className="space-y-4">
            <div className="text-green-600">
                <CheckCircle className="h-12 w-12 mx-auto mb-3" />
                <p className="font-medium text-center">{title}</p>
                <p className="text-sm mt-1 text-center text-muted-foreground">{message}</p>
            </div>

            {transactionSignature && (
                <div>
                    <label className="block text-sm font-medium mb-2">Transaction Signature</label>
                    <div className="flex space-x-2">
                        <input
                            type="text"
                            value={transactionSignature}
                            readOnly
                            className="flex-1 p-2 border rounded-md bg-muted text-muted-foreground text-sm"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                const explorerUrl = `https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`;
                                window.open(explorerUrl, '_blank');
                            }}
                        >
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            <div className="flex space-x-2 mt-6">
                {onContinue && (
                    <Button onClick={onContinue} variant="outline" className="flex-1">
                        {continueLabel}
                    </Button>
                )}
                <Button onClick={onClose} className="flex-1">
                    Close
                </Button>
            </div>
        </div>
    );
}
