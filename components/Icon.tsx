import { WalletCards } from "lucide-react";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <WalletCards size={20} strokeWidth={1.7} />
      </span>
      <span>
        budget<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
