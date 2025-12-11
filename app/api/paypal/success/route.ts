import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function POST(request: Request) {
  const { subscriptionID } = await request.json();

  if (!subscriptionID || typeof subscriptionID !== 'string') {
    return NextResponse.json({ error: 'INVALID_SUBSCRIPTION_ID' }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_pro: true, subscription_id: subscriptionID })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: 'PROFILE_UPDATE_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
