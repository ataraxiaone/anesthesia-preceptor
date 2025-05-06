export default {
  async fetch(request, env, ctx) {
    let query: string | null = null;

    if (request.method === "GET") {
      const url = new URL(request.url);
      query = url.searchParams.get("query");
    } else if (request.method === "POST") {
      try {
        const body = await request.json();
        query = body.query;
      } catch {
        return new Response("Invalid JSON body", { status: 400 });
      }
    } else {
      return new Response("Only GET and POST allowed", { status: 405 });
    }

    if (!query) {
      return new Response("Missing query parameter", { status: 400 });
    }

console.log("🔑 AUTORAG_API_TOKEN:", env.AUTORAG_API_TOKEN);

    const ragRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/autorag/rags/${env.AUTORAG_NAME}/ai-search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.AUTORAG_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        rewrite_query: true,
        max_num_results: 10
      })
    });

    const ragData = await ragRes.json();
    if (!ragData.success) {
      return new Response(JSON.stringify({ error: "AutoRAG failed", details: ragData.errors }), { status: 500 });
    }

    const context = ragData.result?.response || "No relevant context.";
    const sources = ragData.result?.data?.map((doc) => `- ${doc.filename}`).join("\n");

    console.log("🔍 AutoRAG Context:\n", context);
    console.log("📁 Sources:\n", sources);

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You're a clinical assistant for anesthesia providers. Only use provided context. Cite sources.`,
          },
          {
            role: "user",
            content: `Query: ${query}\n\nContext:\n${context}\n\nSources:\n${sources}`
          }
        ],
        temperature: 0.2
      })
    });

    const aiData = await aiRes.json();

    console.log("🤖 OpenAI Raw Response:\n", JSON.stringify(aiData, null, 2));

    return new Response(JSON.stringify({ answer: aiData.choices?.[0]?.message?.content || "No answer." }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};
