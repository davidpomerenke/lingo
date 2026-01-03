"use client";

import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function LoadingSpinner({ 
  message = "Loading...", 
  className,
  size = "md" 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "py-8",
    md: "py-20",
    lg: "py-32",
  };

  return (
    <div className={cn(
      "w-full flex items-center justify-center",
      sizeClasses[size],
      className
    )}>
      <div className="text-muted-foreground">{message}</div>
    </div>
  );
}

interface InlineSpinnerProps {
  className?: string;
}

export function InlineSpinner({ className }: InlineSpinnerProps) {
  return (
    <div 
      className={cn(
        "w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin",
        className
      )} 
    />
  );
}

