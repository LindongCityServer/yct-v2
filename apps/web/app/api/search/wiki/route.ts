import { searchWiki } from '../../../../lib/wiki-search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
  if (!query) {
    return Response.json(
      { results: [] },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } },
    );
  }

  const results = await searchWiki(query);
  return Response.json(
    { results },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
        'X-Robots-Tag': 'noindex',
      },
    },
  );
}
