'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CapabilityKey,
  ExtensionKey,
} from '@/components/capabilities/registry';
import {
  DollarSign,
  Gamepad2,
  CandlestickChart,
  ChevronDown,
} from 'lucide-react';
import { CreateTemplateSidebar } from '@/components/CreateTemplateSidebar';

export default function DocsTemplatesPage() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1>Token Templates</h1>
      <p>
        Mosaic provides three templates that compose Token-2022 extensions for
        common use-cases. New token accounts start frozen and are thawed
        according to your access-control rules (sRFC-37 EBALTS + standard
        allow/block list program).
      </p>

      <TemplatesAccordion />

      <h2 className="mt-10">Single-signer side-effects</h2>
      <p>
        If the fee payer equals the mint authority, creation flows also set up
        EBALTS config, set the gating program to ABL, create the ABL list, set
        extra metas on the mint, and enable permissionless thaw.
      </p>
    </div>
  );
}

function TemplatesAccordion() {
  const [open, setOpen] = useState<string | null>(null);

  type Template = {
    id: string;
    title: string;
    Icon: any;
    summary: string;
    badges: string[];
    capabilities: CapabilityKey[];
    extensions: ExtensionKey[];
  };

  const templates: Template[] = [
    {
      id: 'stablecoin',
      title: 'Stablecoin',
      Icon: DollarSign,
      summary:
        'Compliance-oriented mint with strong controls and optional privacy. Defaults to a blocklist model; switch to allowlist for closed-loop.',
      badges: [
        'Metadata',
        'Pausable',
        'Default Account State',
        'Confidential Transfer',
        'Permanent Delegate',
      ],
      capabilities: [
        'metadata',
        'accessControls',
        'pausable',
        'permanentDelegate',
        'confidentialBalances',
      ],
      extensions: [
        'extMetadata',
        'extPausable',
        'extDefaultAccountStateAllowOrBlock',
        'extConfidentialBalances',
        'extPermanentDelegate',
      ],
    },
    {
      id: 'arcade',
      title: 'Arcade Token',
      Icon: Gamepad2,
      summary:
        'Closed-loop (allowlist-only) mint for games and apps. Accounts must be explicitly allowed before holding or receiving tokens.',
      badges: [
        'Metadata',
        'Pausable',
        'Default Account State (Allowlist)',
        'Permanent Delegate',
      ],
      capabilities: [
        'closedLoopAllowlistOnly',
        'pausable',
        'metadata',
        'permanentDelegate',
      ],
      extensions: [
        'extMetadata',
        'extPausable',
        'extDefaultAccountStateAllow',
        'extPermanentDelegate',
      ],
    },
    {
      id: 'security',
      title: 'Tokenized Security',
      Icon: CandlestickChart,
      summary:
        'Stablecoin feature set plus Scaled UI Amount; display UI-friendly amounts while keeping on-chain units consistent for accounting.',
      badges: [
        'Metadata',
        'Pausable',
        'Default Account State',
        'Confidential Transfer',
        'Permanent Delegate',
        'Scaled UI Amount',
      ],
      capabilities: [
        'metadata',
        'accessControls',
        'pausable',
        'permanentDelegate',
        'confidentialBalances',
        'scaledUIAmount',
      ],
      extensions: [
        'extMetadata',
        'extPausable',
        'extDefaultAccountStateAllowOrBlock',
        'extConfidentialBalances',
        'extPermanentDelegate',
        'extScaledUIAmount',
      ],
    },
  ];

  return (
    <div className="not-prose space-y-4 mt-6">
      {templates.map(t => (
        <Card key={t.id}>
          <button
            type="button"
            className="w-full text-left"
            onClick={() => setOpen(o => (o === t.id ? null : t.id))}
          >
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <t.Icon className="h-5 w-5 text-primary" /> {t.title}
              </CardTitle>
              <ChevronDown
                className={`h-5 w-5 transition-transform ${open === t.id ? 'rotate-180' : ''}`}
              />
            </CardHeader>
          </button>
          <CardContent className="space-y-4 border-t pt-4">
            <p className="text-sm text-muted-foreground">{t.summary}</p>
            <div className="flex flex-wrap gap-2">
              {t.badges.map(b => (
                <Badge key={b} variant="secondary">
                  {b}
                </Badge>
              ))}
            </div>
            {open === t.id && (
              <div className="space-y-3 animate-in fade-in-0">
                <CreateTemplateSidebar
                  description=""
                  coreCapabilityKeys={t.capabilities as CapabilityKey[]}
                  enabledExtensionKeys={t.extensions as ExtensionKey[]}
                  standardKeys={['sRFC37', 'gatingProgram']}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
