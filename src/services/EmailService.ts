/**
 * Email Connection Service (Client-Side)
 *
 * Calls Cloud Functions to connect/disconnect email providers
 * for transaction detection. Works on both Android and iOS.
 *
 * Flow:
 * 1. User taps "Connect Gmail/Outlook/Yahoo" in Profile
 * 2. App opens OAuth consent screen in browser
 * 3. OAuth redirect returns auth code to app
 * 4. This service sends auth code to Cloud Function
 * 5. Cloud Function exchanges code, sets up webhook/polling
 * 6. User starts receiving FCM push notifications for bank emails
 */

import functions from '@react-native-firebase/functions';
import { Linking, Platform } from 'react-native';

export type EmailProvider = 'gmail' | 'outlook' | 'yahoo';

export interface EmailConnectionStatus {
  provider: EmailProvider;
  email: string;
  connected: boolean;
}

// OAuth configuration for each provider
const OAUTH_CONFIG = {
  gmail: {
    // These will be replaced with actual client IDs from Firebase secrets
    // The auth URL is opened in the browser; the Cloud Function handles the token exchange
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    redirectUri: 'trackk://oauth/gmail',
  },
  outlook: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    scope: 'https://graph.microsoft.com/Mail.Read offline_access',
    redirectUri: 'trackk://oauth/outlook',
  },
  yahoo: {
    authUrl: 'https://api.login.yahoo.com/oauth2/request_auth',
    scope: 'mail-r',
    redirectUri: 'trackk://oauth/yahoo',
  },
};

/**
 * Open OAuth consent screen for the given provider.
 * Returns the auth URL that should be opened in a browser.
 *
 * The OAuth redirect (trackk://oauth/{provider}) will be caught by
 * the app's deep link handler, which should call handleOAuthRedirect.
 */
export function getOAuthUrl(provider: EmailProvider, clientId: string): string {
  const config = OAUTH_CONFIG[provider];
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scope,
    access_type: 'offline',
    prompt: 'consent',
  });

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Open the OAuth consent screen in the device's browser.
 */
export async function startOAuthFlow(provider: EmailProvider, clientId: string): Promise<void> {
  const url = getOAuthUrl(provider, clientId);
  await Linking.openURL(url);
}

/**
 * Send the OAuth auth code to the Cloud Function for token exchange.
 * Called after the OAuth redirect returns an auth code.
 */
export async function connectEmail(
  provider: EmailProvider,
  authCode: string
): Promise<{ email: string }> {
  const connectFn = functions().httpsCallable('connectEmail');
  const result = await connectFn({ provider, authCode });
  return result.data as { email: string };
}

/**
 * Disconnect an email provider.
 * Removes stored tokens and cancels webhooks/watches.
 */
export async function disconnectEmail(provider: EmailProvider): Promise<void> {
  const disconnectFn = functions().httpsCallable('disconnectEmail');
  await disconnectFn({ provider });
}

/**
 * Parse an OAuth redirect URL and extract the auth code.
 * Expected format: trackk://oauth/{provider}?code={authCode}
 */
export function parseOAuthRedirect(url: string): { provider: EmailProvider; code: string } | null {
  try {
    // Handle trackk://oauth/gmail?code=xxx
    const match = url.match(/trackk:\/\/oauth\/(gmail|outlook|yahoo)\?(.+)/);
    if (!match) return null;

    const provider = match[1] as EmailProvider;
    const params = new URLSearchParams(match[2]);
    const code = params.get('code');

    if (!code) return null;
    return { provider, code };
  } catch {
    return null;
  }
}

/**
 * Get display name for a provider.
 */
export function getProviderDisplayName(provider: EmailProvider): string {
  switch (provider) {
    case 'gmail': return 'Gmail';
    case 'outlook': return 'Outlook';
    case 'yahoo': return 'Yahoo Mail';
  }
}

/**
 * Get provider icon text.
 */
export function getProviderIcon(provider: EmailProvider): string {
  switch (provider) {
    case 'gmail': return 'G';
    case 'outlook': return 'O';
    case 'yahoo': return 'Y';
  }
}

/**
 * Get provider brand color.
 */
export function getProviderColor(provider: EmailProvider): string {
  switch (provider) {
    case 'gmail': return '#EA4335';
    case 'outlook': return '#0078D4';
    case 'yahoo': return '#6001D2';
  }
}
