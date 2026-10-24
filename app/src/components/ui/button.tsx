import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium cursor-pointer backdrop-blur-md transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed motion-reduce:transform-none motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-ridge ring-1 ring-inset ring-primary-foreground/15 hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0",
        destructive:
          "bg-destructive/95 text-destructive-foreground shadow-sm ring-1 ring-inset ring-destructive-foreground/15 hover:-translate-y-0.5 hover:bg-destructive hover:shadow-md active:translate-y-0",
        outline:
          "border border-border/80 bg-background/65 text-foreground shadow-sm hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card/85 hover:text-primary hover:shadow-ridge active:translate-y-0",
        secondary:
          "border border-border/50 bg-secondary/70 text-secondary-foreground shadow-sm hover:-translate-y-0.5 hover:bg-secondary/90 hover:shadow-ridge active:translate-y-0",
        ghost:
          "border border-transparent hover:-translate-y-0.5 hover:border-border/50 hover:bg-background/65 hover:text-accent-foreground hover:shadow-sm active:translate-y-0",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
