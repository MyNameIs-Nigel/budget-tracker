import { connection } from "next/server";
import { brandIcon } from "@/lib/brand-image";

export async function GET() {
  await connection();
  const png = new Uint8Array(await brandIcon(32).arrayBuffer());
  // An ICO directory containing a generated PNG: supported by modern browsers.
  const ico = new Uint8Array(22 + png.length);
  const header = new DataView(ico.buffer);
  header.setUint16(2, 1, true);
  header.setUint16(4, 1, true);
  ico[6] = ico[7] = 32;
  header.setUint16(10, 1, true);
  header.setUint16(12, 32, true);
  header.setUint32(14, png.length, true);
  header.setUint32(18, 22, true);
  ico.set(png, 22);
  return new Response(ico, {
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
