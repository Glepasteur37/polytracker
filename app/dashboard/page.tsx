import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerActionClient, createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { AlertBuilder } from '@/components/AlertBuilder';
import { PayPalButton } from '@/components/PayPalButton';
import type { Alert, AlertRule } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_FREE_ALERTS = 1;

type AlertRecord = Alert & {
  created_at?: string;
  updated_at?: string;
};

async function canCreateAlert(client: SupabaseClient, userId: string) {
  const { data: profile } = await client.from('profiles').select('is_pro').eq('id', userId).single();

  if (profile?.is_pro) {
    return true;
  }

  const { count } = await client
    .from('alerts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  return (count ?? 0) < MAX_FREE_ALERTS;
}

async function createPresetAlert(formData: FormData) {
  'use server';
  const supabase = createServerActionClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const marketSlug = String(formData.get('market_slug') ?? '').trim();
  const presetType = formData.get('preset_type');

  if (!marketSlug || (presetType !== 'WHALE' && presetType !== 'FLIP')) {
    return;
  }

  const allowed = await canCreateAlert(supabase, user.id);

  if (!allowed) {
    return;
  }

  await supabase.from('alerts').insert({
    user_id: user.id,
    market_slug: marketSlug,
    type: 'PRESET',
    preset_type: presetType,
  });

  revalidatePath('/dashboard');
}

async function createCustomAlert(formData: FormData) {
  'use server';
  const supabase = createServerActionClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const marketSlug = String(formData.get('market_slug') ?? '').trim();
  const rawRule = formData.get('custom_settings');

  if (!marketSlug || typeof rawRule !== 'string' || !rawRule.length) {
    return;
  }

  let rule: AlertRule | null = null;

  try {
    rule = JSON.parse(rawRule) as AlertRule;
  } catch (error) {
    console.error('Invalid rule payload', error);
  }

  if (!rule || !rule.conditions?.length) {
    return;
  }

  const allowed = await canCreateAlert(supabase, user.id);

  if (!allowed) {
    return;
  }

  await supabase.from('alerts').insert({
    user_id: user.id,
    market_slug: marketSlug,
    type: 'CUSTOM',
    custom_settings: rule,
  });

  revalidatePath('/dashboard');
}

async function deleteAlert(formData: FormData) {
  'use server';
  const supabase = createServerActionClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const alertId = formData.get('alert_id');

  if (!alertId || typeof alertId !== 'string') {
    return;
  }

  await supabase.from('alerts').delete().eq('id', alertId).eq('user_id', user.id);
  revalidatePath('/dashboard');
}

export default async function DashboardPage() {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase.from('profiles').select('id, is_pro, subscription_id').eq('id', user.id).single();
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const activeAlerts: AlertRecord[] = (alerts ?? []) as AlertRecord[];
  const isPro = profile?.is_pro ?? false;
  const alertLimitReached = !isPro && activeAlerts.length >= MAX_FREE_ALERTS;
  const planId = process.env.PAYPAL_PLAN_ID ?? '';

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">PolyTrack Dashboard</h1>
        <p className="text-sm text-gray-600">Gérez vos alertes Polymarket et vos préférences d'abonnement.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Alertes Actives</h2>
              <p className="text-sm text-gray-500">{activeAlerts.length} alerte(s) configurée(s)</p>
            </div>
            {!isPro && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Plan Free</span>}
            {isPro && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Plan Pro</span>}
          </header>

          <div className="space-y-3">
            {activeAlerts.length === 0 && <p className="text-sm text-gray-500">Aucune alerte pour l'instant.</p>}
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{alert.market_slug}</p>
                    <p className="text-xs text-gray-500">
                      {alert.type === 'PRESET' ? `Preset ${alert.preset_type}` : 'Custom'}
                    </p>
                  </div>
                  <form action={deleteAlert}>
                    <input type="hidden" name="alert_id" value={alert.id} />
                    <button type="submit" className="text-sm text-red-600">
                      Supprimer
                    </button>
                  </form>
                </div>
                {alert.last_triggered_at && <p className="mt-2 text-xs text-gray-500">Dernier trigger: {new Date(alert.last_triggered_at).toLocaleString()}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Créer une nouvelle alerte</h2>
              <p className="text-sm text-gray-500">Quick Preset ou builder personnalisé.</p>
            </div>
            {alertLimitReached && !isPro && planId && <PayPalButton planId={planId} disabled={false} />}
          </header>

          {alertLimitReached && !isPro ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Limite atteinte. Passez en Pro pour débloquer des alertes illimitées.
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 p-4">
              <input type="radio" id="alert-tab-preset" name="alert-tab" className="tab-input" defaultChecked />
              <input type="radio" id="alert-tab-custom" name="alert-tab" className="tab-input" />

              <div className="tab-controls mb-4 grid grid-cols-2 gap-2">
                <label htmlFor="alert-tab-preset" className="tab-label">
                  Quick Preset
                </label>
                <label htmlFor="alert-tab-custom" className="tab-label">
                  Custom Builder
                </label>
              </div>

              <div className="tab-panels">
                <div id="preset-panel" className="tab-panel">
                  <form className="space-y-4" action={createPresetAlert}>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Slug du marché</label>
                      <input
                        type="text"
                        name="market_slug"
                        className="w-full rounded-md border border-gray-300 p-2 text-sm"
                        placeholder="ex: trump-wins-2024"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Preset</label>
                      <select name="preset_type" className="w-full rounded-md border border-gray-300 p-2 text-sm" required>
                        <option value="WHALE">Alerte Whale</option>
                        <option value="FLIP">Flip Favori</option>
                      </select>
                    </div>

                    <button type="submit" className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
                      Créer l'alerte preset
                    </button>
                  </form>
                </div>

                <div id="custom-panel" className="tab-panel">
                  <form className="space-y-4" action={createCustomAlert}>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Slug du marché</label>
                      <input
                        type="text"
                        name="market_slug"
                        className="w-full rounded-md border border-gray-300 p-2 text-sm"
                        placeholder="ex: trump-wins-2024"
                        required
                      />
                    </div>

                    <AlertBuilder disabled={false} />

                    <button type="submit" className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
                      Créer l'alerte custom
                    </button>
                  </form>
                </div>
              </div>

              <style jsx>{`
                .tab-input {
                  position: absolute;
                  opacity: 0;
                  pointer-events: none;
                }

                .tab-label {
                  display: block;
                  border-radius: 0.5rem;
                  border: 1px solid #e5e7eb;
                  padding: 0.5rem 1rem;
                  text-align: center;
                  font-size: 0.875rem;
                  font-weight: 600;
                  color: #4b5563;
                  cursor: pointer;
                }

                .tab-panels .tab-panel {
                  display: none;
                }

                #alert-tab-preset:checked ~ .tab-controls label[for='alert-tab-preset'],
                #alert-tab-custom:checked ~ .tab-controls label[for='alert-tab-custom'] {
                  border-color: #4f46e5;
                  background-color: #eef2ff;
                  color: #312e81;
                }

                #alert-tab-preset:checked ~ .tab-panels #preset-panel,
                #alert-tab-custom:checked ~ .tab-panels #custom-panel {
                  display: block;
                }
              `}</style>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
