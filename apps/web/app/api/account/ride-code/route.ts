import { NextRequest, NextResponse } from 'next/server';
import { markResponseNoStore } from '../../../../lib/http-cache';
import { createRideCodeRedemptionLink } from '../../../../lib/ride-code-workflow';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return markResponseNoStore(user.response);
  }

  const result = await createRideCodeRedemptionLink({
    ldpassUserId: user.ldpassUserId,
    serverAccountName: user.serverAccountName,
    serverAccountVerified: user.serverAccountVerified,
  });
  if (!result.ok) {
    return markResponseNoStore(
      NextResponse.json(
        {
          error: result.reason,
          message: result.message,
        },
        {
          status:
            result.reason === 'not_configured'
              ? 503
              : result.reason === 'account_not_bound'
                ? 403
                : result.reason === 'session_active'
                  ? 409
                  : 502,
        },
      ),
    );
  }

  return markResponseNoStore(
    NextResponse.json({
      actionUrl: result.actionUrl,
      sessionId: result.sessionId,
      expiresAt: result.expiresAt,
    }),
  );
}
