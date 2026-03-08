"use client";

import { useEffect, useState } from "react";

interface NotificationBadgeProps {
  userRole: string;
}

export default function NotificationBadge({ userRole }: NotificationBadgeProps) {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    // Skip for client_viewer role
    if (userRole === "client_viewer") return;

    const fetchCount = async () => {
      try {
        const res = await fetch(`/api/banners/pending-count?role=${userRole}`);
        if (res.ok) {
          const data = await res.json();
          setCount(data.count || 0);
        }
      } catch {
        // Silently fail — badge just won't show
      }
    };

    fetchCount();
    // Refresh every 60 seconds
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, [userRole]);

  if (count === 0) return null;

  return (
    <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
