// Local inference is the default. No automatic switch to a billed provider.
export function modelConfig(env = process.env) {
  const provider = env.AI_PROVIDER || "ollama";
  if (provider === "ollama")
    return {
      provider,
      model: env.OLLAMA_MODEL || "llama3.2:latest",
      configured: true,
    };
  if (provider === "gemini")
    return {
      provider,
      model: env.GEMINI_MODEL || "gemini-2.5-flash",
      configured: !!env.GEMINI_API_KEY,
    };
  if (provider === "fixture")
    return { provider, model: null, configured: false };
  throw new Error(
    "AI_PROVIDER must be ollama, gemini, or fixture. Billed providers are disabled.",
  );
}
export async function generateJSON(
  system,
  input,
  schema,
  { env = process.env, fetcher = fetch } = {},
) {
  const config = modelConfig(env);
  if (!config.configured)
    throw new Error(
      "Configure a local Ollama model or a Gemini free-tier key. No AI result was generated.",
    );
  let response;
  const user = JSON.stringify(input);
  if (config.provider === "ollama") {
    response = await fetcher("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      signal: AbortSignal.timeout(180000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        format: schema,
        options: { temperature: 0, num_ctx: 8192, num_predict: 2400 },
        messages: [
          {
            role: "system",
            content: system + " Return only JSON matching the supplied schema.",
          },
          { role: "user", content: user },
        ],
      }),
    });
  } else {
    if (env.FREE_TIER_CONFIRMED !== "true")
      throw new Error(
        "Confirm your Google project has no paid billing by setting FREE_TIER_CONFIRMED=true. Local Ollama needs no billing.",
      );
    response = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        signal: AbortSignal.timeout(60000),
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
            maxOutputTokens: 4000,
          },
        }),
      },
    );
  }
  if (!response.ok)
    throw new Error(
      `${config.provider} returned ${response.status}. No fallback provider was called. Check the model service or free-tier quota.`,
    );
  const body = await response.json();
  const raw =
    config.provider === "ollama"
      ? body.message?.content
      : body.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
  if (typeof raw !== "string")
    throw new Error("The model did not return a JSON result.");
  let data;
  try {
    data = JSON.parse(
      raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
    );
  } catch {
    throw new Error(
      "Model output was incomplete or invalid JSON. No changes were applied.",
    );
  }
  return { data, provider: config.provider, model: config.model };
}
