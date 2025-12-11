import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getMarketData, type MarketData } from '@/lib/polymarket';
import type { Alert, AlertCondition, AlertRule } from '@/types';

interface AlertRow extends Alert {
  custom_settings: AlertRule | null;
}

interface AlertEvaluationContext {
  alert: AlertRow;
  market: MarketData;
}

const supabaseAdmin = createAdminClient();
const resendClient = createResendClient();
const marketCache = new Map<string, Promise<MarketData>>();
const favoriteOutcomeCache = new Map<string, string | null>();
const volumeCache = new Map<string, number>();
const userEmailCache = new Map<string, Promise<string | null>>();

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const alerts = await fetchActiveAlerts();

    if (!alerts.length) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    let processed = 0;

    for (const alert of alerts) {
      const market = await fetchMarket(alert.market_slug);
      const shouldTrigger = evaluateAlert({ alert, market });

      if (!shouldTrigger) {
        continue;
      }

      const recipient = await resolveUserEmail(alert.user_id);

      if (!recipient) {
        continue;
      }

      await resendClient.emails.send({
        from: 'PolyTrack Alerts <alerts@polytrack.app>',
        to: recipient,
        subject: buildEmailSubject(alert, market),
        html: buildEmailHtml(alert, market),
      });

      await markAlertTriggered(alert.id);
      processed += 1;
    }

    return NextResponse.json({ success: true, processed });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'CRON_FAILED' }, { status: 500 });
  }
}

function isCronAuthorized(request: Request): boolean {
  const secret = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    throw new Error('CRON_SECRET env variable missing');
  }

  const token = secret?.replace('Bearer ', '').trim();
  return token === expectedSecret;
}

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase admin credentials missing');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY env variable missing');
  }

  return new Resend(apiKey);
}

async function fetchActiveAlerts(): Promise<AlertRow[]> {
  const { data, error } = await supabaseAdmin.from('alerts').select('*');

  if (error) {
    throw error;
  }

  return (data ?? []) as AlertRow[];
}

async function fetchMarket(slug: string) {
  const cached = marketCache.get(slug);

  if (cached) {
    return cached;
  }

  const promise = getMarketData(slug);
  marketCache.set(slug, promise);
  return promise;
}

async function resolveUserEmail(userId: string): Promise<string | null> {
  const cached = userEmailCache.get(userId);

  if (cached) {
    return cached;
  }

  const promise = supabaseAdmin.auth.admin
    .getUserById(userId)
    .then(({ data, error }) => {
      if (error) {
        console.error('Unable to fetch user email', error);
        return null;
      }

      return data?.user?.email ?? null;
    });

  userEmailCache.set(userId, promise);
  return promise;
}

function evaluateAlert({ alert, market }: AlertEvaluationContext) {
  if (alert.type === 'PRESET') {
    if (alert.preset_type === 'WHALE') {
      return evaluateWhalePreset(alert.id, market);
    }

    if (alert.preset_type === 'FLIP') {
      return evaluateFlipPreset(alert.id, market);
    }

    return false;
  }

  if (!alert.custom_settings) {
    return false;
  }

  return evaluateCustomRule(alert.custom_settings, market);
}

function evaluateWhalePreset(alertId: string, market: MarketData): boolean {
  const previousVolume = volumeCache.get(alertId) ?? market.totalVolume;
  const volumeSpike = market.totalVolume > previousVolume * 1.2;
  const simulatedLargeTrade = market.outcomes.some((outcome) => outcome.volume >= 10000);

  volumeCache.set(alertId, market.totalVolume);

  return volumeSpike || simulatedLargeTrade;
}

function evaluateFlipPreset(alertId: string, market: MarketData): boolean {
  const currentFavorite = market.favoriteOutcomeId;
  const previousFavorite = favoriteOutcomeCache.get(alertId);

  favoriteOutcomeCache.set(alertId, currentFavorite ?? null);

  if (!currentFavorite || !previousFavorite) {
    return false;
  }

  return currentFavorite !== previousFavorite;
}

function evaluateCustomRule(rule: AlertRule, market: MarketData) {
  if (!rule.conditions?.length) {
    return false;
  }

  const evaluator = (condition: AlertCondition) => evaluateCondition(condition, market);

  if (rule.operator === 'AND') {
    return rule.conditions.every(evaluator);
  }

  return rule.conditions.some(evaluator);
}

function evaluateCondition(condition: AlertCondition, market: MarketData): boolean {
  const { operator, value } = condition;
  const primaryOutcome = market.outcomes[0];
  let metricValue = 0;

  switch (condition.metric) {
    case 'volume':
      metricValue = market.totalVolume;
      break;
    case 'probability':
      metricValue = primaryOutcome?.probability ?? 0;
      break;
    case 'price':
      metricValue = primaryOutcome?.price ?? 0;
      break;
    default:
      metricValue = 0;
  }

  return operator === 'gt' ? metricValue > value : metricValue < value;
}

async function markAlertTriggered(alertId: string) {
  const { error } = await supabaseAdmin
    .from('alerts')
    .update({ last_triggered_at: new Date().toISOString() })
    .eq('id', alertId);

  if (error) {
    console.error('Failed to update alert trigger timestamp', error);
  }
}

function buildEmailSubject(alert: AlertRow, market: MarketData) {
  if (alert.type === 'PRESET' && alert.preset_type) {
    return `PolyTrack ${alert.preset_type} alert for ${market.title}`;
  }

  return `PolyTrack custom alert for ${market.title}`;
}

function buildEmailHtml(alert: AlertRow, market: MarketData) {
  const outcomesHtml = market.outcomes
    .map((outcome) => `<li><strong>${outcome.label}</strong> — Price: ${outcome.price.toFixed(2)} | Probability: ${(outcome.probability * 100).toFixed(1)}% | Volume: ${outcome.volume.toLocaleString()}</li>`) // eslint-disable-line max-len
    .join('');

  return `
    <div>
      <p>Alert triggered for <strong>${market.title}</strong> (${market.slug}).</p>
      <ul>${outcomesHtml}</ul>
      <p>Total Volume: ${market.totalVolume.toLocaleString()}</p>
      <p>Triggered via ${alert.type === 'PRESET' ? `preset ${alert.preset_type}` : 'custom rule'}.</p>
    </div>
  `;
}
