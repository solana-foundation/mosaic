import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { updateScaledUiMultiplier } from '@/lib/management/scaledUiAmount';
import { useWalletAccountTransactionSendingSigner } from '@solana/react';
import { useContext, useState as useReactState } from 'react';
import { SelectedWalletAccountContext } from '@/context/SelectedWalletAccountContext';
import { Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { TokenDisplay } from '@/types/token';

interface TokenExtensionsProps {
  token: TokenDisplay;
}

export function TokenExtensions({ token }: TokenExtensionsProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showScaledUiEditor, setShowScaledUiEditor] = useReactState(false);
  const [newMultiplier, setNewMultiplier] = useReactState<string>('');
  const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);
  const transactionSendingSigner = useWalletAccountTransactionSendingSigner(
    selectedWalletAccount,
    'solana:devnet'
  );

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Token Extensions
          </CardTitle>
          {isDropdownOpen ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </button>
        <CardDescription>Extensions enabled on this token</CardDescription>
      </CardHeader>
      {isDropdownOpen && (
        <CardContent>
          <div className="space-y-3">
            {token.extensions && token.extensions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {token.extensions.map((extension, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                  >
                    {extension}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No extensions configured
              </p>
            )}

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <h4 className="font-medium">Metadata</h4>
                <p className="text-sm text-muted-foreground">
                  Update token metadata and URI
                </p>
              </div>
              <Button variant="outline" size="sm">
                Edit
              </Button>
            </div>
          </div>
          {token.extensions?.includes('Scaled UI Amount') && (
            <div className="p-3 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Scaled UI Amount</h4>
                  <p className="text-sm text-muted-foreground">
                    Update the UI amount multiplier for this mint
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowScaledUiEditor(prev => !prev)}
                >
                  {showScaledUiEditor ? 'Hide' : 'Edit'}
                </Button>
              </div>
              {showScaledUiEditor && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">
                      New Multiplier
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="w-full p-2 border rounded"
                      value={newMultiplier}
                      onChange={e => setNewMultiplier(e.target.value)}
                      placeholder="e.g., 1.5"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      className="w-full"
                      disabled={!token.address || !newMultiplier}
                      onClick={async () => {
                        if (!token.address || !transactionSendingSigner) return;
                        const multiplier = Number(newMultiplier);
                        if (!Number.isFinite(multiplier) || multiplier <= 0)
                          return;
                        await updateScaledUiMultiplier(
                          { mint: token.address, multiplier },
                          transactionSendingSigner
                        );
                        setNewMultiplier('');
                        setShowScaledUiEditor(false);
                      }}
                    >
                      Update Multiplier
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
