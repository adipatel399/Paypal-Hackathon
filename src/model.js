// Local inference is the default. No automatic switch to a billed provider.
export function modelConfig(env = process.env) {
  const provider = env.AI_PROVIDER || "ollama";
  if (provider === "ollama")
    return {
      provider,
      model: env.OLLAMA_MODEL || "llama3.2:latest",
      configured: true,
    };
  if (provider === "groq")
    return {
      provider,
      model: env.GROQ_MODEL || "openai/gpt-oss-20b",
      configured: !!env.GROQ_API_KEY,
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
    "AI_PROVIDER must be ollama, groq, gemini, or fixture. No automatic provider switching is allowed.",
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
      "Configure Ollama or a Groq/Gemini free-tier key. No AI result was generated.",
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
  } else if (config.provider === "groq") {
    if (env.GROQ_FREE_TIER_CONFIRMED !== "true")
      throw new Error(
        "Verify the Groq account is on Free without a payment method, then set GROQ_FREE_TIER_CONFIRMED=true. The app cannot inspect account billing.",
      );
    const supported = [
      "openai/gpt-oss-20b",
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b",
    ];
    if (!supported.includes(config.model))
      throw new Error(
        "Choose a supported Groq structured-output model. No request was sent.",
      );
    response = await fetcher(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(60000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          temperature: 0,
          max_completion_tokens: 4096,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "greenlight_result",
              strict: true,
              schema: strictSchema(schema),
            },
          },
        }),
      },
    );
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
  if (response.status === 429)
    throw Object.assign(
      new Error(
        "The selected AI provider's rate limit was reached. Wait and try again. No upgrade or fallback was attempted.",
      ),
      { status: 429 },
    );
  if (!response.ok)
    throw new Error(
      `${config.provider} returned ${response.status}. No fallback provider was called. Check the model service or free-tier quota.`,
    );
  const body = await response.json();
  const raw =
    config.provider === "ollama"
      ? body.message?.content
      : config.provider === "groq"
        ? body.choices?.[0]?.message?.content
        : body.candidates?.[0]?.content?.parts
            ?.map((p) => p.text || "")
            .join("");
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

// Groq strict mode requires every object's properties to be required, and forbids extras.
export function strictSchema(schema) {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== "object") return schema;
  const result = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, strictSchema(value)]),
  );
  if (result.type === "object" || result.properties) {
    result.additionalProperties = false;
    if (result.properties) result.required = Object.keys(result.properties);
  }
  return result;
}
