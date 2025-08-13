'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DollarSign, Gamepad2 } from 'lucide-react';
import Link from 'next/link';

export default function CreatePage() {
  return (
    <div className="flex-1 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-4">Create New Token</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Choose the type of token you want to create
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/dashboard/create/stablecoin" className="block">
            <Card className="h-full flex flex-col cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center">
                  <DollarSign className="h-8 w-8 text-primary mr-3" />
                  <CardTitle>Stablecoin</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription>
                  Create a regulatory-compliant stablecoin with transfer
                  restrictions and metadata management.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/create/arcade-token" className="block">
            <Card className="h-full flex flex-col cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center">
                  <Gamepad2 className="h-8 w-8 text-primary mr-3" />
                  <CardTitle>Arcade Token</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription>
                  Deploy a gaming or utility token with custom extensions and
                  features.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/create/tokenized-security" className="block">
            <Card className="h-full flex flex-col cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center">
                  <DollarSign className="h-8 w-8 text-primary mr-3" />
                  <CardTitle>Tokenized Security</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription>
                  Create a compliant security token with scaled UI amounts and
                  core controls.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
