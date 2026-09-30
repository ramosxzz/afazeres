export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* resposta vazia */
  }
  if (!res.ok) {
    const err = data as { error?: string; code?: string } | null;
    if (res.status === 401 && path !== "/auth/login") onUnauthorized();
    throw new ApiError(err?.error ?? `Erro ${res.status}`, res.status, err?.code);
  }
  return data as T;
}
