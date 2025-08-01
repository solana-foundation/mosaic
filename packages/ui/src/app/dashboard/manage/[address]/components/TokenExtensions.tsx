import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Settings,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { TokenDisplay } from '@/types/token';

interface TokenExtensionsProps {
  token: TokenDisplay;
}

export function TokenExtensions({
  token,
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
