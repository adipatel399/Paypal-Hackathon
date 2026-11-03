# Setup without paying

## Already working on the development Mac

Ollama is installed, `llama3.2:latest` is downloaded, and `.env` selects local inference. No Anthropic subscription or AI API key is needed. No Azure resources have been provisioned.

## The remaining account step: PayPal sandbox

1. Open https://developer.paypal.com/dashboard/applications/sandbox and sign in to your PayPal developer account.
2. Stay on **Sandbox**, create an app, and copy its client ID and secret into the local `.env` file:

```dotenv
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_secret
```

3. Keep `PAYMENT_MODE=demo` until we are ready to run sandbox verification. An organizer token has already been generated privately in this Mac's `.env`.
4. Tell the coding agent the file is ready. Do not paste secret values into chat or GitHub.
5. Use **personal sandbox accounts** and their test balances to approve test orders. Never use live-account credentials or real money for this hackathon.

PayPal sandbox is a test environment. It is separate from a production integration. Account eligibility and access are controlled by PayPal. Reference: https://developer.paypal.com/api/get-started/

## Optional alternative if local inference is too slow

Google AI Studio has a limited free Gemini API tier: https://ai.google.dev/gemini-api/docs/pricing . Use a project without paid billing; the app cannot check your project's billing status. Do not enable billing for this project. Local Ollama is the default and needs no cloud account.

## Azure student account

Keep it available, but no deployment is needed to satisfy the repository run-instructions route. Before using student benefits, inspect the actual available credits, service limits, region and spending protection in your own account. This project does not assume any particular student entitlement and will not provision resources automatically.
