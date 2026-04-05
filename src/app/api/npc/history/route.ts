import { NextResponse } from 'next/server';
import { NPC_BY_ID, type NPCId } from '@/data/npcs';
import { getPlayerConversationHistory } from '@/lib/hydradb';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const npcId = searchParams.get('npcId') as NPCId | null;

  if (!npcId || !NPC_BY_ID[npcId]) {
    return NextResponse.json({ error: 'Invalid npcId' }, { status: 400 });
  }

  try {
    const messages = await getPlayerConversationHistory(npcId);
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? 'Unable to fetch history' },
      { status: 500 }
    );
  }
}
