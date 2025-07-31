import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Settings } from 'lucide-react';
import { TokenDisplay } from '@/types/token';

interface TokenAuthoritiesProps {
  token: TokenDisplay;
}

export function TokenAuthorities({ token }: TokenAuthoritiesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Settings className="h-5 w-5 mr-2" />
          Token Authorities
        </CardTitle>
        <CardDescription>Manage the authorities for this token</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {token.mintAuthority && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Mint Authority
              </label>
              <code className="block text-sm bg-muted px-2 py-1 rounded mt-1 font-mono">
                {token.mintAuthority.slice(0, 8)}...
                {token.mintAuthority.slice(-8)}
              </code>
            </div>
          )}
          {token.metadataAuthority && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Metadata Authority
              </label>
              <code className="block text-sm bg-muted px-2 py-1 rounded mt-1 font-mono">
                {token.metadataAuthority.slice(0, 8)}...
                {token.metadataAuthority.slice(-8)}
              </code>
            </div>
          )}
          {token.pausableAuthority && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Pausable Authority
              </label>
              <code className="block text-sm bg-muted px-2 py-1 rounded mt-1 font-mono">
                {token.pausableAuthority.slice(0, 8)}...
                {token.pausableAuthority.slice(-8)}
              </code>
            </div>
          )}
          {token.confidentialBalancesAuthority && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Confidential Balances Authority
              </label>
              <code className="block text-sm bg-muted px-2 py-1 rounded mt-1 font-mono">
                {token.confidentialBalancesAuthority.slice(0, 8)}...
                {token.confidentialBalancesAuthority.slice(-8)}
              </code>
            </div>
          )}
          {token.permanentDelegateAuthority && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Permanent Delegate Authority
              </label>
              <code className="block text-sm bg-muted px-2 py-1 rounded mt-1 font-mono">
                {token.permanentDelegateAuthority.slice(0, 8)}...
                {token.permanentDelegateAuthority.slice(-8)}
              </code>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
