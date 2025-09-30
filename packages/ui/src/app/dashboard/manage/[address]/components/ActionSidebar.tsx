import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, Ban, Trash2, ArrowRightLeft } from 'lucide-react';

interface ActionSidebarProps {
  isPaused: boolean;
  onTogglePause: () => void;
  onMintTokens: () => void;
  onForceTransfer: () => void;
}

export function ActionSidebar({
  isPaused,
  onTogglePause,
  onMintTokens,
  onForceTransfer,
}: ActionSidebarProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* <Button className="w-full" variant="outline">
            <Edit className="h-4 w-4 mr-2" />
            Edit Token
          </Button> */}
          {/* <Button className="w-full" variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Configure Extensions
          </Button> */}
          <Button className="w-full" variant="outline" onClick={onMintTokens}>
            <Coins className="h-4 w-4 mr-2" />
            Mint Tokens
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={onForceTransfer}
          >
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Force Transfer
          </Button>
          <Button
            className="w-full"
            variant={isPaused ? 'default' : 'outline'}
            onClick={onTogglePause}
          >
            {isPaused ? (
              <>
                <Coins className="h-4 w-4 mr-2" />
                Unpause Token
              </>
            ) : (
              <>
                <Ban className="h-4 w-4 mr-2" />
                Pause Token
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" variant="destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Burn Token
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
