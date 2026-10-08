import { connection } from "next/server";
import { brandIcon } from "@/lib/brand-image";

export function generateImageMetadata() {
  return [32, 192, 512].map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  await connection();
  const size = Number(await id);
  if (![32, 192, 512].includes(size))
    return new Response(null, { status: 404 });
  return brandIcon(size);
}
