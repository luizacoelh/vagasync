// Stub do SDK do Gemini (@google/generative-ai) para os testes: nunca acessa a
// rede. A resposta vem de globalThis.__geminiReply (objeto, serializado como
// o texto JSON que o modelo devolveria) e cada chamada é contada em
// globalThis.__geminiCalls.
export class GoogleGenerativeAI {
  getGenerativeModel() {
    return {
      async generateContent() {
        globalThis.__geminiCalls = (globalThis.__geminiCalls ?? 0) + 1;
        const text = JSON.stringify(globalThis.__geminiReply);
        return { response: { candidates: [{ content: { parts: [{ text }] } }], text: () => text } };
      },
    };
  }
}
