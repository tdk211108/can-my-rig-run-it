import { NextRequest, NextResponse } from 'next/server';
import type { SteamSearchResultItem } from '@/lib/steamParser';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const term = searchParams.get('term');
  const requestedCountryCode = (searchParams.get('cc') || 'US').toUpperCase();
  const countryCode = /^[A-Z]{2}$/.test(requestedCountryCode) ? requestedCountryCode : 'US';

  if (!term || term.trim().length === 0) {
    return NextResponse.json({ items: [] });
  }

  try {
    const steamUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(
      term.trim()
    )}&l=english&cc=${encodeURIComponent(countryCode)}`;

    const response = await fetch(steamUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 3600 }, // Cache 1 giờ
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Unable to connect to the Steam Store API.' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const items: SteamSearchResultItem[] = (data.items || []).filter(
      (item: any) => item.type === 'app'
    );

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    console.error('Lỗi khi gọi Steam Search API:', error);
    return NextResponse.json(
      { error: 'An error occurred while searching Steam.' },
      { status: 500 }
    );
  }
}
