"use client";
import Link from "next/link";
import { ArrowLeftRight, Coins, Plus, Receipt, Trophy, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";

export function QuickLog({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button
            type="button"
            aria-label="Log new record"
            className={cn("flex size-12 -translate-y-3 items-center justify-center rounded-full bg-positive-strong text-white shadow-lg shadow-black/40 ring-4 ring-bg", className)}
          >
            <Plus className="size-6" />
          </button>
        ) : (
          <Button className={className}>
            <Plus /> Log
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "center" : "start"} className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/sessions/new">
            <Coins /> Cash session
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/tournaments/new">
            <Trophy /> Tournament
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/expenses?new=1">
            <Receipt /> Expense
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/bankroll?new=transaction">
            <Wallet /> Deposit / withdrawal
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/bankroll?new=transfer">
            <ArrowLeftRight /> Transfer
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
