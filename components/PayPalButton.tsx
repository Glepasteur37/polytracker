'use client';

import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PayPalButtonProps {
  planId: string;
  disabled?: boolean;
}

export function PayPalButton({ planId, disabled }: PayPalButtonProps) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  if (!clientId) {
    return <p className="text-sm text-red-600">Configuration PayPal manquante.</p>;
  }

  return (
    <PayPalScriptProvider options={{ clientId, intent: 'subscription', vault: true }}>
      <PayPalSubscribeButton planId={planId} disabled={disabled} />
    </PayPalScriptProvider>
  );
}

function PayPalSubscribeButton({ planId, disabled }: PayPalButtonProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      <PayPalButtons
        disabled={disabled || isProcessing}
        style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'subscribe' }}
        createSubscription={(_, actions) => actions.subscription.create({ plan_id: planId })}
        onApprove={async (data) => {
          if (!data.subscriptionID) {
            setErrorMessage('Subscription ID manquant.');
            return;
          }

          try {
            setIsProcessing(true);
            setErrorMessage(null);
            const response = await fetch('/api/paypal/success', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subscriptionID: data.subscriptionID }),
            });

            if (!response.ok) {
              throw new Error('Erreur lors de la confirmation.');
            }

            router.refresh();
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Impossible de confirmer le paiement.');
          } finally {
            setIsProcessing(false);
          }
        }}
        onError={(error) => {
          console.error(error);
          setErrorMessage('PayPal a rencontré une erreur.');
        }}
      />
    </div>
  );
}
