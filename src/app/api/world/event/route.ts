import { NextResponse } from 'next/server';
import { BACKSTORY_EVENTS } from '@/data/mystery';
import { ingestNPCMemory, ingestWorldEvent, recallWorldState, seedBackstory } from '@/lib/hydradb';

type EventRequest = {
  description: string;
  location: string;
  entities: string[];
  gameTime: string;
  isClue?: boolean;
  clueId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<EventRequest>;

    if (!body.description || !body.location || !Array.isArray(body.entities) || !body.gameTime) {
      return NextResponse.json({ error: 'description, location, entities, and gameTime are required' }, { status: 400 });
    }

    const event: EventRequest = {
      description: body.description,
      location: body.location,
      entities: body.entities,
      gameTime: body.gameTime,
      isClue: body.isClue,
      clueId: body.clueId
    };

    await ingestWorldEvent(event);

    if (event.isClue) {
      await Promise.all(
        event.entities.map((entity) => ingestNPCMemory(entity, event.description, event.gameTime))
      );
    }

    return NextResponse.json({
      ok: true,
      description: event.description,
      descriptions: [event.description]
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const seededBefore = (await recallWorldState('backstory_seeded')).includes('backstory_seeded: true');
    await seedBackstory();

    return NextResponse.json({
      seeded: true,
      note: seededBefore ? 'Backstory already seeded.' : `Seeding backstory (${BACKSTORY_EVENTS.length} events)...`,
      descriptions: seededBefore ? [] : BACKSTORY_EVENTS.map((event) => event.text)
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
