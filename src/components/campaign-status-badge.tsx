const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  Draft: { label: "Draft", bg: "bg-gray-100", text: "text-gray-500" },
  Copy_In_Progress: { label: "Copy", bg: "bg-blue-50", text: "text-blue-600" },
  Ready_For_Figma: { label: "Ready", bg: "bg-amber-50", text: "text-amber-600" },
  In_Design: { label: "Design", bg: "bg-purple-50", text: "text-purple-600" },
  Pending_Review: { label: "Review", bg: "bg-orange-50", text: "text-orange-600" },
  Approved: { label: "Approved", bg: "bg-green-50", text: "text-green-600" },
  Delivered: { label: "Delivered", bg: "bg-gray-200", text: "text-gray-600" },
};

interface Props {
  status: string;
  /** If true, shows a pulsing dot for "needs attention" states */
  attention?: boolean;
}

export default function CampaignStatusBadge({ status, attention }: Props) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.Draft;
  const isAttention = attention ?? (status === "Ready_For_Figma" || status === "Pending_Review");

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}
    >
      {isAttention && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      {cfg.label}
    </span>
  );
}
