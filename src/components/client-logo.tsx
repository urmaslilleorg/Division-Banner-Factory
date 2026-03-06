"use client";

import { useState } from "react";

interface ClientLogoProps {
  src: string;
  alt: string;
}

export default function ClientLogo({ src, alt }: ClientLogoProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-8 w-auto"
      onError={() => setHasError(true)}
    />
  );
}
