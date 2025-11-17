import { CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { ReactNode } from 'react';
import { CapabilityKey, ExtensionKey, capabilityNodes, extensionNodes } from '@/components/capabilities/registry';

interface CreateTemplateSidebarProps {
    aboutTitle?: string;
    description: ReactNode;
    coreCapabilities?: ReactNode[];
    enabledExtensions?: ReactNode[];
    standards?: ReactNode[];
    coreCapabilityKeys?: CapabilityKey[];
    enabledExtensionKeys?: ExtensionKey[];
    standardKeys?: CapabilityKey[];
}

export function CreateTemplateSidebar({
    aboutTitle = 'About this template',
    description,
    coreCapabilities,
    enabledExtensions,
    standards,
    coreCapabilityKeys,
    enabledExtensionKeys,
    standardKeys,
}: CreateTemplateSidebarProps) {
    const resolvedCore = coreCapabilities ? coreCapabilities : (coreCapabilityKeys || []).map(k => capabilityNodes[k]);
    const resolvedExtensions = enabledExtensions
        ? enabledExtensions
        : (enabledExtensionKeys || []).map(k => extensionNodes[k]);
    const resolvedStandards = standards ? standards : (standardKeys || []).map(k => capabilityNodes[k]);
    return (
        <div className="rounded-lg border">
            <CardHeader>
                <CardTitle className="text-lg font-semibold">{aboutTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <div className="text-muted-foreground">{description}</div>

                {resolvedCore?.length > 0 && (
                    <div>
                        <h4 className="font-medium">Core capabilities</h4>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            {resolvedCore.map((item, idx) => (
                                <li key={idx}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {(resolvedExtensions.length > 0 || resolvedStandards.length > 0) && (
                    <div>
                        <h4 className="font-medium">Underlying standards</h4>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            {resolvedExtensions.length > 0 && (
                                <li>
                                    <strong>Token extensions</strong>:{' '}
                                    {resolvedExtensions.map((n, i) => (
                                        <span key={i}>
                                            {n}
                                            {i < resolvedExtensions.length - 1 ? ', ' : ''}
                                        </span>
                                    ))}
                                </li>
                            )}
                            {resolvedStandards.map((item, idx) => (
                                <li key={idx}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="text-muted-foreground">
                    You can manage lists and authorities later from the token management dashboard.
                </div>
            </CardContent>
        </div>
    );
}
