/** The server answered and rejected the request; retrying will not help. */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  url: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers:
      data !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: data !== undefined ? JSON.stringify(data) : undefined,
    cache: "no-store",
  });
  let value;
  try {
    value = await res.json();
  } catch {
    throw new Error("Could not connect. Your edits are still here; try again.");
  }
  if (!res.ok)
    throw new RequestError(
      value.message ?? "Could not complete this request.",
      res.status,
    );
  return value as T;
}
export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
