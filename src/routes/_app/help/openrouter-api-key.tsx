import { createFileRoute } from "@tanstack/react-router";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/settings/keys";

export const Route = createFileRoute("/_app/help/openrouter-api-key")({
  component: OpenrouterApiKeyHelpPage,
});

function OpenrouterApiKeyHelpPage() {
  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3">
            <h1 className="text-2xl font-semibold">
              Set up your OpenRouter API key
            </h1>
            <p className="text-sm text-base-content/70">
              OpenSEO needs the <code>OPENROUTER_API_KEY</code> secret before AI
              features like SAM, the in-app SEO agent, can run. It is optional —
              everything else in OpenSEO works without it.
            </p>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <h2 className="card-title text-base">Steps</h2>
            <ol className="list-decimal pl-5 text-sm space-y-3 text-base-content/80">
              <li>
                Create an account at{" "}
                <a
                  className="link link-primary"
                  href="https://openrouter.ai"
                  target="_blank"
                  rel="noreferrer"
                >
                  openrouter.ai
                </a>{" "}
                and add credits (pay-as-you-go, like DataForSEO).
              </li>
              <li>
                Go to{" "}
                <a
                  className="link link-primary"
                  href={OPENROUTER_KEYS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenRouter API Keys
                </a>{" "}
                and click "Create API Key".
              </li>
              <li>
                Save the key as the <code>OPENROUTER_API_KEY</code> secret in
                your environment:
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>
                    Docker self-hosting: <code>.env</code>
                  </li>
                  <li>Cloudflare: set it in the Workers UI (see below)</li>
                  <li>
                    Local development: <code>.env.local</code>
                  </li>
                </ul>
              </li>
              <li>Restart OpenSEO.</li>
            </ol>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3">
            <h2 className="card-title text-base">Using it for free</h2>
            <p className="text-sm text-base-content/80">
              OpenRouter offers $0 models (their <code>:free</code> tier), so
              you can run AI features without adding credits. Set an additional{" "}
              <code>OPENROUTER_MODEL</code> secret to{" "}
              <code>openrouter/free</code> — OpenRouter's auto-router, which
              picks among currently available free, tool-calling-capable models
              for you.
            </p>
            <p className="text-sm text-base-content/60">
              Trade-off: free models are rate-limited, rotate without notice,
              and generally reason and write less well than paid models like the
              default. If SAM's answers feel shallow or requests get
              rate-limited during heavy use, that is the free tier, not a bug —
              remove the <code>OPENROUTER_MODEL</code> override to fall back to
              the paid default.
            </p>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2 text-sm text-base-content/75">
            <h2 className="card-title text-base">
              Cloudflare Workers (Dashboard UI)
            </h2>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-base-content/80">
              <li>
                In Cloudflare, go to <code>Compute</code> -&gt;{" "}
                <code>Workers &amp; Pages</code>
                and open your OpenSEO Worker.
              </li>
              <li>
                Open <code>Settings</code>.
              </li>
              <li>
                Go to <code>Variables &amp; Secrets</code> and add a new secret
                named
                <code className="mx-1">OPENROUTER_API_KEY</code>.
              </li>
              <li>Paste your OpenRouter API key and save.</li>
            </ol>

            <div className="divider my-1" />

            <p>Or set the same secret from your terminal with:</p>
            <pre className="p-3 rounded bg-base-200 border border-base-300 overflow-x-auto text-xs">
              <code>npx wrangler secret put OPENROUTER_API_KEY</code>
            </pre>
            <p>Paste your OpenRouter API key when prompted.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
