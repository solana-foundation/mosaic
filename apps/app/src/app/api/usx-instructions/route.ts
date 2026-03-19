/**
 * /api/usx-instructions
 *
 * Server-side proxy for the Solstice Finance instruction API.
 * Keeps USX_API_KEY out of the browser bundle by routing all
 * instruction requests through this Next.js API route.
 *
 * POST /api/usx-instructions
 *   Body: UsxInstructionRequest (JSON)
 *   Returns: UsxInstructionResponse with base64-encoded Solana instruction
 *
 * Required env var (set in .env.local):
 *   USX_API_KEY  — API key from Solstice Finance / hackathon portal
 *
 * Optional:
 *   USX_API_URL  — Override base URL (defaults to instructions.solstice.finance)
 *
 * Example body:
 * {
 *   "type": "Lock",
 *   "data": { "amount": 1000, "user": "<wallet address>" }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUsxClient, type UsxInstructionRequest } from '@solana/mosaic-sdk';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    let body: UsxInstructionRequest;

    try {
        body = await request.json() as UsxInstructionRequest;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body?.type) {
        return NextResponse.json({ error: 'Missing required field: type' }, { status: 400 });
    }

    const client = getUsxClient();

    try {
        const result = await client.getInstruction(body);
        return NextResponse.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // Surface USX API error status codes when available
        const statusMatch = message.match(/USX API error (\d+):/);
        const status = statusMatch ? parseInt(statusMatch[1]!, 10) : 502;

        return NextResponse.json({ error: message }, { status });
    }
}
