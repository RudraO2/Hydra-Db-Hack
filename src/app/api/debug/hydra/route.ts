import { NextResponse } from 'next/server';
import { NPC_BY_ID, type NPCId } from '@/data/npcs';
import { getHydraDebugSnapshot } from '@/lib/hydradb';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const npcIds = (searchParams.get('npcIds') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value): value is NPCId => value in NPC_BY_ID)
    .slice(0, 2);

  try {
    const snapshot = await getHydraDebugSnapshot(npcIds);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? 'Unable to fetch HydraDB debug data' },
      { status: 500 }
    );
  }
}
