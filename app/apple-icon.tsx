import { connection } from "next/server";
import { brandIcon } from "@/lib/brand-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function Icon() {
  await connection();
  return brandIcon(size.width);
}
