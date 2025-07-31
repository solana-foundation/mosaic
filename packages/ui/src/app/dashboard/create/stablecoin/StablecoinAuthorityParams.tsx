import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { StablecoinOptions } from '@/types/token';

interface StablecoinAuthorityParamsProps {
  options: StablecoinOptions;
  onInputChange: (field: string, value: string) => void;
}

export function StablecoinAuthorityParams({ options, onInputChange }: StablecoinAuthorityParamsProps) {
  const [showOptionalParams, setShowOptionalParams] = useState(false);

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setShowOptionalParams(!showOptionalParams)}
          className="flex items-center gap-2 text-left"
        >
          <CardTitle>Authority Parameters (Optional)</CardTitle>
          {showOptionalParams ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        <CardDescription>
          Configure authorities for advanced token management
        </CardDescription>
      </CardHeader>
      {showOptionalParams && (
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Mint Authority
            </label>
            <input
              type="text"
              className="w-full p-3 border rounded-lg"
              placeholder="Public key or leave empty for connected wallet"
              value={options.mintAuthority}
              onChange={e =>
                onInputChange('mintAuthority', e.target.value)
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Metadata Authority
            </label>
            <input
              type="text"
              className="w-full p-3 border rounded-lg"
              placeholder="Public key or leave empty for connected wallet"
              value={options.metadataAuthority}
              onChange={e =>
                onInputChange('metadataAuthority', e.target.value)
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Pausable Authority
            </label>
            <input
              type="text"
              className="w-full p-3 border rounded-lg"
              placeholder="Public key or leave empty for connected wallet"
              value={options.pausableAuthority}
              onChange={e =>
                onInputChange('pausableAuthority', e.target.value)
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Confidential Balances Authority
            </label>
            <input
              type="text"
              className="w-full p-3 border rounded-lg"
              placeholder="Public key or leave empty for connected wallet"
              value={options.confidentialBalancesAuthority}
              onChange={e =>
                onInputChange(
                  'confidentialBalancesAuthority',
                  e.target.value
                )
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Permanent Delegate Authority
            </label>
            <input
              type="text"
              className="w-full p-3 border rounded-lg"
              placeholder="Public key or leave empty for connected wallet"
              value={options.permanentDelegateAuthority}
              onChange={e =>
                onInputChange(
                  'permanentDelegateAuthority',
                  e.target.value
                )
              }
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}