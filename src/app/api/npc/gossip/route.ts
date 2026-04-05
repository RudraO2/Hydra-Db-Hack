import { NextResponse } from 'next/server';
import { ensureBackstorySeeded } from '@/lib/hydradb';
import { findGossipPair, runGossipExchange } from '@/lib/gossipEngine';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      npcPositions: Record<string, string>;
      gameTime: string;
    };

    if (!body.npcPositions || typeof body.gameTime !== 'string') {
      return NextResponse.json({ error: 'npcPositions and gameTime are required' }, { status: 400 });
    }

    let memoryReady = true;
    try {
      await ensureBackstorySeeded();
    } catch {
      memoryReady = false;
    }

    const pair = findGossipPair(body.npcPositions);
    if (!pair) {
      return NextResponse.json({ noPair: true });
    }

    const [npc1Id, npc2Id, location] = pair;
    const session = await runGossipExchange(npc1Id, npc2Id, location, body.gameTime);

    return NextResponse.json({
      ...session,
      memoryReady
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
