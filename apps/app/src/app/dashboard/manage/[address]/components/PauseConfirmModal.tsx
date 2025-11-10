import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PauseConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isPaused: boolean;
  tokenName: string;
  isLoading?: boolean;
  error?: string;
}

export function PauseConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isPaused,
  tokenName,
  isLoading = false,
  error,
}: PauseConfirmModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };

  const action = isPaused ? 'Unpause' : 'Pause';
  const actionContinuous = isPaused ? 'Unpausing' : 'Pausing';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background p-6 rounded-lg w-full max-w-lg mx-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <h3 className="text-lg font-semibold">{action} Token</h3>
        </div>

        <div className="mb-4 text-sm text-muted-foreground">
          {isPaused ? (
            <>
              You are about to <strong>unpause</strong> the token{' '}
              <strong>{tokenName}</strong>. This will allow all token transfers
              to resume normally.
            </>
          ) : (
            <>
              You are about to <strong>pause</strong> the token{' '}
              <strong>{tokenName}</strong>. This will prevent all token
              transfers until the token is unpaused.
            </>
          )}
        </div>

        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> This is a sensitive operation that
            affects all token holders. Make sure you understand the implications
            before proceeding.
            {!isPaused && (
              <>
                <br />
                <br />
                <strong>When paused:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                  <li>No token transfers will be possible</li>
                  <li>Token holders cannot send or receive tokens</li>
                  <li>Mint authority cannot mint new tokens</li>
                  <li>Freeze authority cannot freeze or thaw tokens</li>
                  <li>DeFi protocols may not function properly</li>
                  <li>Only the pause authority can unpause the token</li>
                </ul>
              </>
            )}
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex space-x-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading || isConfirming}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant={isPaused ? 'default' : 'destructive'}
            onClick={handleConfirm}
            disabled={isLoading || isConfirming}
            className="flex-1"
          >
            {isLoading || isConfirming ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {actionContinuous}...
              </>
            ) : (
              <>Confirm {action}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
