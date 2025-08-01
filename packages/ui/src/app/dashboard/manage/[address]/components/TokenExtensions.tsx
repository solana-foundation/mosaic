import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Plus, X, Shield, Ban, ChevronDown, ChevronUp } from 'lucide-react';
import { TokenDisplay } from '@/types/token';

interface TokenExtensionsProps {
  token: TokenDisplay;
  allowlist: string[];
  blocklist: string[];
  onAddToAllowlist: () => void;
  onRemoveFromAllowlist: (address: string) => void;
  onAddToBlocklist: () => void;
  onRemoveFromBlocklist: (address: string) => void;
}

export function TokenExtensions({
  token,
  allowlist,
  blocklist,
  onAddToAllowlist,
  onRemoveFromAllowlist,
  onAddToBlocklist,
  onRemoveFromBlocklist,
}: TokenExtensionsProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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

            <div className="p-3 border rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium">Transfer Restrictions</h4>
                  <p className="text-sm text-muted-foreground">
                    Control who can transfer tokens
                  </p>
                </div>
              </div>

              {/* Transfer Restrictions based on token type */}
              {token && token.type === 'stablecoin' ? (
                /* Blocklist for Stablecoins */
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <Ban className="h-4 w-4 mr-2 text-red-600" />
                      <h5 className="font-medium">Blocklist</h5>
                      <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                        Stablecoin
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onAddToBlocklist}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Address
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Block specific addresses from transferring this stablecoin
                  </p>
                  {blocklist.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No addresses in blocklist
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {blocklist.map((addr, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-muted rounded"
                        >
                          <code className="text-xs font-mono flex-1">
                            {addr.slice(0, 8)}...{addr.slice(-8)}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveFromBlocklist(addr)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Allowlist for Arcade Tokens */
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <Shield className="h-4 w-4 mr-2 text-green-600" />
                      <h5 className="font-medium">Allowlist</h5>
                      <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        Arcade Token
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onAddToAllowlist}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Address
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Allow only specific addresses to transfer this arcade token
                  </p>
                  {allowlist.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No addresses in allowlist
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {allowlist.map((addr, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-muted rounded"
                        >
                          <code className="text-xs font-mono flex-1">
                            {addr.slice(0, 8)}...{addr.slice(-8)}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveFromAllowlist(addr)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

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
        </CardContent>
      )}
    </Card>
  );
}
