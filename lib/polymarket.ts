interface GammaEventResponse {
  events: GammaEvent[];
}

interface GammaEvent {
  slug: string;
  title: string;
  markets?: GammaMarket[];
}

interface GammaMarket {
  id: string;
  question: string;
  volume?: number;
  outcomes?: string[];
  outcomePrices?: number[];
  outcomeVolumes?: number[];
}

export interface MarketOutcome {
  id: string;
  label: string;
  price: number;
  probability: number;
  volume: number;
}

export interface MarketData {
  slug: string;
  title: string;
  totalVolume: number;
  outcomes: MarketOutcome[];
  favoriteOutcomeId: string | null;
}

const POLYMARKET_BASE_URL = 'https://gamma-api.polymarket.com/events';

const normalizeOutcome = (
  market: GammaMarket,
  index: number,
): MarketOutcome => {
  const label = market.outcomes?.[index] ?? `Outcome ${index + 1}`;
  const price = market.outcomePrices?.[index] ?? 0;
  const volume = market.outcomeVolumes?.[index] ?? 0;
  const probability = price;

  return {
    id: `${market.id}-${index}`,
    label,
    price,
    probability,
    volume,
  };
};

export const getMarketData = async (slug: string): Promise<MarketData> => {
  const url = `${POLYMARKET_BASE_URL}?slug=${encodeURIComponent(slug)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Polymarket request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as GammaEventResponse;
  const event = payload.events?.[0];

  if (!event) {
    throw new Error(`Market with slug ${slug} not found`);
  }

  const market = event.markets?.[0];

  if (!market) {
    throw new Error(`No markets available for slug ${slug}`);
  }

  const totalOutcomes = market.outcomes?.length ?? 0;

  if (totalOutcomes === 0) {
    throw new Error(`Market ${market.id} does not contain outcomes data`);
  }
  const normalizedOutcomes: MarketOutcome[] = Array.from({ length: totalOutcomes }, (_, index) =>
    normalizeOutcome(market, index),
  );

  const sortedOutcomes = normalizedOutcomes
    .sort((a, b) => {
      if (b.volume !== a.volume) {
        return b.volume - a.volume;
      }

      return b.probability - a.probability;
    })
    .slice(0, 2);

  const favoriteOutcome = sortedOutcomes.reduce<MarketOutcome | null>((favorite, current) => {
    if (!favorite || current.probability > favorite.probability) {
      return current;
    }

    return favorite;
  }, null);

  const totalVolume = typeof market.volume === 'number' ? market.volume : sortedOutcomes.reduce((acc, outcome) => acc + outcome.volume, 0);

  return {
    slug: event.slug,
    title: event.title,
    totalVolume,
    outcomes: sortedOutcomes,
    favoriteOutcomeId: favoriteOutcome?.id ?? null,
  };
};
