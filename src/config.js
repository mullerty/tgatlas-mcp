// The one place the host and the key live.

export const HOST = process.env.TELEGRAM_API_HOST || 'telegram155.p.rapidapi.com';
export const BASE = `https://${HOST}/v1`;

export const API_KEY =
  process.env.TELEGRAM_API_KEY || process.env.RAPIDAPI_KEY || process.env.X_RAPIDAPI_KEY;

export const TIMEOUT_MS = Number(process.env.TELEGRAM_TIMEOUT_MS || 30000);

export function assertKey() {
  if (!API_KEY) {
    throw new Error(
      'No API key. Set TELEGRAM_API_KEY (or RAPIDAPI_KEY) to your RapidAPI key.\n' +
        'Get one at https://rapidapi.com/starnikovoleg/api/telegram155'
    );
  }
}
