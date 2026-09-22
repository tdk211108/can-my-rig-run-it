import { NextRequest, NextResponse } from 'next/server';
import { parseSteamRequirementHtml, SteamGameDetails } from '@/lib/steamParser';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const appId = searchParams.get('appId');
  const requestedCountryCode = (searchParams.get('cc') || 'US').toUpperCase();
  const countryCode = /^[A-Z]{2}$/.test(requestedCountryCode) ? requestedCountryCode : 'US';

  if (!appId) {
    return NextResponse.json({ error: 'The appId parameter is required.' }, { status: 400 });
  }

  try {
    const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(
      appId
    )}&l=english&cc=${encodeURIComponent(countryCode)}`;

    const response = await fetch(steamUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 86400 }, // Cache 24 giờ cho cấu hình game
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Unable to load game details from Steam.' },
        { status: response.status }
      );
    }

    const json = await response.json();
    const appData = json[appId];

    if (!appData || !appData.success || !appData.data) {
      return NextResponse.json(
        { error: 'The game does not exist or its data is unavailable.' },
        { status: 404 }
      );
    }

    const data = appData.data;
    const priceOverview = data.price_overview;
    const price = priceOverview
      ? {
          initial: priceOverview.initial,
          final: priceOverview.final,
          discountPercent: priceOverview.discount_percent || 0,
          currency: priceOverview.currency,
          initialFormatted: priceOverview.initial_formatted,
          finalFormatted: priceOverview.final_formatted,
        }
      : undefined;

    const minimumParsed = parseSteamRequirementHtml(data.pc_requirements?.minimum);
    const recommendedParsed = parseSteamRequirementHtml(data.pc_requirements?.recommended);

    const gameDetails: SteamGameDetails = {
      id: data.steam_appid,
      name: data.name,
      shortDescription: data.short_description || '',
      headerImage: data.header_image,
      capsuleImage: data.capsule_image,
      developers: data.developers || [],
      publishers: data.publishers || [],
      genres: (data.genres || []).map((g: any) => g.description),
      releaseDate: data.release_date?.date || 'N/A',
      price,
      priceFormatted: price?.finalFormatted || (data.is_free ? 'Free' : 'Price unavailable'),
      minimum: minimumParsed,
      recommended: recommendedParsed,
    };

    return NextResponse.json({ game: gameDetails });
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết game từ Steam:', error);
    return NextResponse.json(
      { error: 'An internal error occurred while processing Steam game details.' },
      { status: 500 }
    );
  }
}
