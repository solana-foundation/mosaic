import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ActionResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: string;
  transactionSignature: string;
  actionInProgress: boolean;
}

export function ActionResultModal({
  isOpen,
  onClose,
  error,
  transactionSignature,
  actionInProgress,
}: ActionResultModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border rounded-lg w-full max-w-md mx-4 shadow-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {actionInProgress ? (
              <span className="text-yellow-500">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
              </span>
            ) : error ? (
              <span className="text-red-500">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
              </span>
            ) : (
              <span className="text-green-500">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </span>
            )}
            {actionInProgress ? 'Action in progress...' : error ? 'Error' : 'Success'}
          </h3>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Action in progress message */}
          {actionInProgress && (
            <div className="text-sm">
              <p className="text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-3 leading-relaxed">
                Action in progress. Please sign and submit the transaction to complete the action.
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="text-sm">
              <p className="text-red-700 bg-red-50 border border-red-200 rounded-md p-3 leading-relaxed">
                {error}
              </p>
            </div>
          )}

          {/* Success Message */}
          {!error && !actionInProgress && (
            <div className="text-sm">
              <p className="text-green-700 bg-green-50 border border-green-200 rounded-md p-3 leading-relaxed">
                Operation completed successfully!
              </p>
            </div>
          )}

          {/* Transaction Link */}
          {transactionSignature && (
            <div className="border-t pt-4">
              <Link
                href={`https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`}
                target="_blank"
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors font-medium text-sm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z" />
                </svg>
                View transaction on Solana Explorer
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/20">
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
