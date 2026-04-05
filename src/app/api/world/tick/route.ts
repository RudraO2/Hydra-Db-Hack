import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  console.log('world tick');
  return NextResponse.json({
    ok: true,
    description: 'world tick'
  });
}
