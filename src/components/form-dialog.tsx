"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button, type ButtonProps } from "./ui/button";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";

/**
 * A dialog hosting a form. `openParam` lets links like `?new=transfer` open it
 * directly (used by the quick-log menu on mobile).
 */
export function FormDialog({
  title,
  description,
  trigger,
  triggerVariant = "primary",
  triggerSize = "md",
  openParam,
  children,
  wide,
}: {
  title: string;
  description?: string;
  trigger: React.ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  openParam?: { key: string; value: string };
  children: (close: () => void) => React.ReactNode;
  wide?: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = openParam ? params.get(openParam.key) === openParam.value : false;
  const [open, setOpen] = React.useState(fromUrl);
  // Open when the URL starts asking for it (adjusting state during render).
  const [prevFromUrl, setPrevFromUrl] = React.useState(fromUrl);
  if (fromUrl !== prevFromUrl) {
    setPrevFromUrl(fromUrl);
    if (fromUrl) setOpen(true);
  }
  const change = (v: boolean) => {
    setOpen(v);
    if (!v && fromUrl && openParam) {
      const next = new URLSearchParams(params.toString());
      next.delete(openParam.key);
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    }
  };
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description} className={wide ? "sm:max-w-2xl" : undefined}>
        {children(() => change(false))}
      </DialogContent>
    </Dialog>
  );
}
