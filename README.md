<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/74e4df4b-a068-44ec-887b-ef5d71f8466e

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Etsy draft connection

The Etsy integration runs through the local Express server so the shared secret and OAuth tokens are never exposed to the browser.

1. Add these values to `.env.local`:

   ```env
   ETSY_API_KEY="your Etsy keystring"
   ETSY_SHARED_SECRET="your Etsy shared secret"
   ETSY_REDIRECT_URI="https://your-public-app-url/api/etsy/callback"
   ```

2. Add the exact same `ETSY_REDIRECT_URI` to the callback URLs of your Etsy Developer app.
3. Restart `npm run dev`, select a product, and click `Connect Etsy`.
4. Approve the requested `listings_r`, `listings_w`, and `shops_r` permissions on Etsy.

Etsy requires an HTTPS callback. For local development, expose port 3000 through an HTTPS tunnel and use its callback URL. OAuth tokens are stored locally in `.etsy-auth.json`, which is excluded from Git.
