"use client";

import * as React from "react";
import Link from "next/link";
import { motion, type HTMLMotionProps } from "motion/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { springTactile } from "@/lib/motion";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium tracking-tight outline-none transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-[var(--peel-base)] hover:bg-[var(--peel-primary-hover)] [box-shadow:var(--shadow-primary)]",
  secondary: "bevel-machined bg-raised text-ink hover:bg-active",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink",
};

// Inner radius = outer radius - padding (concentric squircle rule), kept pill-shaped here.
const sizes: Record<Size, string> = {
  sm: "h-9 rounded-full px-4 text-[13px]",
  md: "h-11 rounded-full px-5 text-sm",
  lg: "h-13 rounded-full px-7 text-[15px]",
};

const tap = { scale: 0.96 };
const hover = { y: -1 };

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={tap}
      whileHover={hover}
      transition={springTactile}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </motion.button>
  );
});

const MotionLink = motion.create(Link);

export interface LinkButtonProps
  extends Omit<React.ComponentProps<typeof MotionLink>, "children" | "ref"> {
  variant?: Variant;
  size?: Size;
  children?: React.ReactNode;
}

export function LinkButton({ variant = "primary", size = "md", className, children, ...props }: LinkButtonProps) {
  return (
    <MotionLink
      whileTap={tap}
      whileHover={hover}
      transition={springTactile}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </MotionLink>
  );
}
