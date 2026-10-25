// Guarda onde a pessoa estava em /monitoradas (busca e posição da rolagem)
// ao abrir uma vaga, para voltar ao mesmo ponto — pelo botão "Monitoradas",
// depois de descartar ou de marcar "Tenho interesse" dentro da vaga.
// sessionStorage: some ao fechar a aba e cada aba tem o seu.
const KEY = "vagasync:monitoradas-view";

export interface MonitoredView {
  search: string;
  scrollY: number;
}

export function saveMonitoredView(view: MonitoredView) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    // modo privado/armazenamento bloqueado: só não restaura a posição
  }
}

// Lê e apaga: a posição vale para a próxima volta, não para sempre.
export function takeMonitoredView(): MonitoredView | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const data = JSON.parse(raw) as Partial<MonitoredView>;
    return {
      search: typeof data.search === "string" ? data.search : "",
      scrollY: typeof data.scrollY === "number" ? data.scrollY : 0,
    };
  } catch {
    return null;
  }
}
