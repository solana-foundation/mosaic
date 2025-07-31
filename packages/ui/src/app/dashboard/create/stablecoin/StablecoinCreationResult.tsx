import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';
import { StablecoinCreationResult } from '@/types/token';

interface StablecoinCreationResultProps {
  result: StablecoinCreationResult;
}

export function StablecoinCreationResultDisplay({ result }: StablecoinCreationResultProps) {
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {result.success ? (
            <>
              <DollarSign className="h-6 w-6 text-green-600" />
              Stablecoin Created Successfully!
            </>
          ) : (
            <>
              <DollarSign className="h-6 w-6 text-red-600" />
              Creation Failed
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {result.success ? (
          <div className="space-y-4">
            <div>
              <strong>Mint Address:</strong>
              <code className="ml-2 bg-muted px-2 py-1 rounded text-sm">
                {result.mintAddress}
              </code>
            </div>
            <div>
              <strong>Transaction:</strong>
              <code className="ml-2 bg-muted px-2 py-1 rounded text-sm">
                {result.transactionSignature}
              </code>
            </div>
            <div className="text-sm text-muted-foreground">
              Your stablecoin has been successfully created with the
              following parameters:
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Name:</strong> {result.details?.name}
              </div>
              <div>
                <strong>Symbol:</strong> {result.details?.symbol}
              </div>
              <div>
                <strong>Decimals:</strong> {result.details?.decimals}
              </div>
              <div>
                <strong>Extensions:</strong>{' '}
                {result.details?.extensions?.join(', ')}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-red-600">
            <strong>Error:</strong> {result.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}